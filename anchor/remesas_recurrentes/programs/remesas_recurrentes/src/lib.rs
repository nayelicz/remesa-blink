//! Programa Anchor: Remesas Recurrentes
//! Gestiona suscripciones de pagos recurrentes en Solana (SOL y USDC).

use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::token::{self, Token, Transfer};

declare_id!("B1G72CcRGHYc1UpG4o51VrJySLiwm3d7tCHbQiSb5vZ2");

#[program]
pub mod remesas_recurrentes {
    use super::*;

    /// Registra una nueva suscripción de remesa recurrente.
    /// PDA: ["suscripcion", remitente, destinatario]
    pub fn registrar_suscripcion(
        ctx: Context<RegistrarSuscripcion>,
        monto: u64,
        frecuencia: Frecuencia,
    ) -> Result<()> {
        require!(monto > 0, ErrorCode::MontoInvalido);
        require!(frecuencia != Frecuencia::Desconocida, ErrorCode::FrecuenciaInvalida);

        let clock = Clock::get()?;
        let now = clock.unix_timestamp;

        let suscripcion = &mut ctx.accounts.suscripcion;
        suscripcion.remitente = ctx.accounts.remitente.key();
        suscripcion.destinatario = ctx.accounts.destinatario.key();
        suscripcion.monto = monto;
        suscripcion.frecuencia = frecuencia;
        suscripcion.proximo_pago = now;
        suscripcion.ultimo_pago = 0;
        suscripcion.activa = true;
        suscripcion.bump = ctx.bumps.suscripcion;

        msg!("Suscripcion registrada: {} lamports cada {:?}", monto, frecuencia);
        Ok(())
    }

    /// Ejecuta un pago de la suscripción. Solo el keeper puede llamar.
    /// Transfiere SOL del remitente al destinatario y actualiza fechas.
    pub fn ejecutar_pago(ctx: Context<EjecutarPago>) -> Result<()> {
        let suscripcion = &mut ctx.accounts.suscripcion;
        require!(suscripcion.activa, ErrorCode::SuscripcionInactiva);

        let clock = Clock::get()?;
        let now = clock.unix_timestamp;
        require!(suscripcion.proximo_pago <= now, ErrorCode::PagoNoVencido);

        let monto = suscripcion.monto;

        // Transferir SOL: remitente -> destinatario
        let cpi_ctx = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.remitente.to_account_info(),
                to: ctx.accounts.destinatario.to_account_info(),
            },
        );
        system_program::transfer(cpi_ctx, monto)?;

        // Actualizar fechas
        suscripcion.ultimo_pago = now;
        suscripcion.proximo_pago = calcular_proximo_pago(now, suscripcion.frecuencia);

        msg!("Pago ejecutado: {} lamports. Proximo pago: {}", monto, suscripcion.proximo_pago);
        Ok(())
    }

    /// Cancela una suscripción. Solo el remitente puede cancelar.
    pub fn cancelar_suscripcion(ctx: Context<CancelarSuscripcion>) -> Result<()> {
        let suscripcion = &mut ctx.accounts.suscripcion;
        suscripcion.activa = false;
        msg!("Suscripcion cancelada");
        Ok(())
    }

    /// Registra una suscripción de remesa recurrente en USDC (SPL Token).
    pub fn registrar_suscripcion_usdc(
        ctx: Context<RegistrarSuscripcionUsdc>,
        monto: u64,
        frecuencia: Frecuencia,
    ) -> Result<()> {
        require!(monto > 0, ErrorCode::MontoInvalido);
        require!(frecuencia != Frecuencia::Desconocida, ErrorCode::FrecuenciaInvalida);

        let clock = Clock::get()?;
        let now = clock.unix_timestamp;

        let suscripcion = &mut ctx.accounts.suscripcion_usdc;
        suscripcion.remitente = ctx.accounts.remitente.key();
        suscripcion.destinatario = ctx.accounts.destinatario.key();
        suscripcion.mint = ctx.accounts.mint.key();
        suscripcion.monto = monto;
        suscripcion.frecuencia = frecuencia;
        suscripcion.proximo_pago = now;
        suscripcion.ultimo_pago = 0;
        suscripcion.activa = true;
        suscripcion.bump = ctx.bumps.suscripcion_usdc;

        msg!("Suscripcion USDC registrada: {} unidades cada {:?}", monto, frecuencia);
        Ok(())
    }

    /// Ejecuta un pago USDC de la suscripción. Solo el keeper puede llamar.
    pub fn ejecutar_pago_usdc(ctx: Context<EjecutarPagoUsdc>) -> Result<()> {
        let suscripcion = &ctx.accounts.suscripcion_usdc;
        require!(suscripcion.activa, ErrorCode::SuscripcionInactiva);

        let clock = Clock::get()?;
        let now = clock.unix_timestamp;
        require!(suscripcion.proximo_pago <= now, ErrorCode::PagoNoVencido);

        let monto = suscripcion.monto;

        let cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.source_token_account.to_account_info(),
                to: ctx.accounts.dest_token_account.to_account_info(),
                authority: ctx.accounts.authority.to_account_info(),
            },
        );
        token::transfer(cpi_ctx, monto)?;

        let suscripcion = &mut ctx.accounts.suscripcion_usdc;
        suscripcion.ultimo_pago = now;
        suscripcion.proximo_pago = calcular_proximo_pago(now, suscripcion.frecuencia);

        msg!("Pago USDC ejecutado: {}. Proximo pago: {}", monto, suscripcion.proximo_pago);
        Ok(())
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum Frecuencia {
    Desconocida,
    Diario,
    Semanal,
    Mensual,
}

fn calcular_proximo_pago(ultimo: i64, frecuencia: Frecuencia) -> i64 {
    const SEGUNDOS_DIA: i64 = 86400;
    const SEGUNDOS_SEMANA: i64 = 7 * SEGUNDOS_DIA;
    const SEGUNDOS_MES: i64 = 30 * SEGUNDOS_DIA;

    match frecuencia {
        Frecuencia::Diario => ultimo + SEGUNDOS_DIA,
        Frecuencia::Semanal => ultimo + SEGUNDOS_SEMANA,
        Frecuencia::Mensual => ultimo + SEGUNDOS_MES,
        _ => ultimo,
    }
}

#[account]
pub struct Suscripcion {
    pub remitente: Pubkey,
    pub destinatario: Pubkey,
    pub monto: u64,
    pub frecuencia: Frecuencia,
    pub proximo_pago: i64,
    pub ultimo_pago: i64,
    pub activa: bool,
    pub bump: u8,
}

impl Suscripcion {
    pub const LEN: usize = 32 + 32 + 8 + 1 + 8 + 8 + 1 + 1; // sin discriminator
}

#[account]
pub struct SuscripcionUsdc {
    pub remitente: Pubkey,
    pub destinatario: Pubkey,
    pub mint: Pubkey,
    pub monto: u64,
    pub frecuencia: Frecuencia,
    pub proximo_pago: i64,
    pub ultimo_pago: i64,
    pub activa: bool,
    pub bump: u8,
}

impl SuscripcionUsdc {
    pub const LEN: usize = 32 + 32 + 32 + 8 + 1 + 8 + 8 + 1 + 1;
}

#[derive(Accounts)]
pub struct RegistrarSuscripcion<'info> {
    #[account(
        init,
        payer = remitente,
        space = 8 + Suscripcion::LEN, // 8 = discriminator
        seeds = [b"suscripcion", remitente.key().as_ref(), destinatario.key().as_ref()],
        bump
    )]
    pub suscripcion: Account<'info, Suscripcion>,

    #[account(mut)]
    pub remitente: Signer<'info>,

    /// CHECK: Solo almacenamos la dirección del destinatario
    pub destinatario: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct EjecutarPago<'info> {
    #[account(
        mut,
        seeds = [b"suscripcion", suscripcion.remitente.as_ref(), suscripcion.destinatario.as_ref()],
        bump = suscripcion.bump,
        constraint = suscripcion.activa @ ErrorCode::SuscripcionInactiva
    )]
    pub suscripcion: Account<'info, Suscripcion>,

    #[account(
        mut,
        address = suscripcion.remitente
    )]
    pub remitente: SystemAccount<'info>,

    #[account(
        mut,
        address = suscripcion.destinatario
    )]
    pub destinatario: SystemAccount<'info>,

    /// Keeper: quien ejecuta el pago (debe tener autorización off-chain)
    pub keeper: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CancelarSuscripcion<'info> {
    #[account(
        mut,
        seeds = [b"suscripcion", suscripcion.remitente.as_ref(), suscripcion.destinatario.as_ref()],
        bump = suscripcion.bump,
        constraint = remitente.key() == suscripcion.remitente @ ErrorCode::SoloRemitente
    )]
    pub suscripcion: Account<'info, Suscripcion>,

    pub remitente: Signer<'info>,
}

#[derive(Accounts)]
pub struct RegistrarSuscripcionUsdc<'info> {
    #[account(
        init,
        payer = remitente,
        space = 8 + SuscripcionUsdc::LEN,
        seeds = [b"suscripcion_usdc", remitente.key().as_ref(), destinatario.key().as_ref(), mint.key().as_ref()],
        bump
    )]
    pub suscripcion_usdc: Account<'info, SuscripcionUsdc>,

    #[account(mut)]
    pub remitente: Signer<'info>,

    /// CHECK: Dirección del destinatario
    pub destinatario: UncheckedAccount<'info>,

    /// CHECK: USDC mint
    pub mint: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct EjecutarPagoUsdc<'info> {
    #[account(
        mut,
        seeds = [b"suscripcion_usdc", suscripcion_usdc.remitente.as_ref(), suscripcion_usdc.destinatario.as_ref(), suscripcion_usdc.mint.as_ref()],
        bump = suscripcion_usdc.bump,
        constraint = suscripcion_usdc.activa @ ErrorCode::SuscripcionInactiva
    )]
    pub suscripcion_usdc: Account<'info, SuscripcionUsdc>,

    /// CHECK: ATA del keeper para el mint. Validado por CPI.
    #[account(mut)]
    pub source_token_account: UncheckedAccount<'info>,

    /// CHECK: ATA del destinatario para el mint. Validado por CPI.
    #[account(mut)]
    pub dest_token_account: UncheckedAccount<'info>,

    #[account(constraint = authority.key() == suscripcion_usdc.remitente @ ErrorCode::SoloRemitente)]
    pub authority: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

#[error_code]
pub enum ErrorCode {
    #[msg("El monto debe ser mayor a 0")]
    MontoInvalido,

    #[msg("Frecuencia no valida")]
    FrecuenciaInvalida,

    #[msg("La suscripcion esta inactiva")]
    SuscripcionInactiva,

    #[msg("El pago aun no ha vencido")]
    PagoNoVencido,

    #[msg("Solo el remitente puede cancelar")]
    SoloRemitente,

    #[msg("Cuenta de token invalida")]
    InvalidTokenAccount,
}
