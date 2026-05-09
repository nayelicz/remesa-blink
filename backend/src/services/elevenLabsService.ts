// ─────────────────────────────────────────────────────────
// elevenLabsService.ts  –  Text-to-Speech con ElevenLabs
// Convierte el lidiaScript del PricingEngine en audio MP3
// ─────────────────────────────────────────────────────────

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY ?? '';
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID ?? 'EXAVITQu4vr4xnSDxMaL'; // "Sarah" en español - voz femenina cálida
const ELEVENLABS_MODEL    = 'eleven_multilingual_v2'; // soporta español MX

const TMP_DIR = path.join(__dirname, '../../tmp/audio');

// ── Asegurar que el directorio temporal existe ────────────────────────────────
function ensureTmpDir() {
  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
}

// ── Generar audio MP3 desde texto ─────────────────────────────────────────────
export async function textToSpeech(text: string): Promise<Buffer> {
  if (!ELEVENLABS_API_KEY) {
    throw new Error('ELEVENLABS_API_KEY no configurada en .env');
  }

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key':   ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
        'Accept':       'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: ELEVENLABS_MODEL,
        voice_settings: {
          stability:        0.55,  // voz natural, no robótica
          similarity_boost: 0.80,  // consistente con el perfil de voz
          style:            0.20,  // ligera expresividad
          use_speaker_boost: true,
        },
      }),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`ElevenLabs error ${response.status}: ${err}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// ── Guardar audio en disco y devolver la ruta ─────────────────────────────────
export async function generateAudioFile(
  text: string,
  filename?: string
): Promise<string> {
  ensureTmpDir();
  const fname = filename ?? `lidia_${Date.now()}.mp3`;
  const filepath = path.join(TMP_DIR, fname);
  const buffer = await textToSpeech(text);
  fs.writeFileSync(filepath, buffer);
  console.log(`[ElevenLabs] Audio generado → ${filepath}`);
  return filepath;
}

// ── Limpiar audios temporales > 1 hora ───────────────────────────────────────
export function cleanOldAudioFiles() {
  if (!fs.existsSync(TMP_DIR)) return;
  const files = fs.readdirSync(TMP_DIR);
  const oneHourAgo = Date.now() - 3600_000;
  for (const f of files) {
    const fp = path.join(TMP_DIR, f);
    const stat = fs.statSync(fp);
    if (stat.mtimeMs < oneHourAgo) {
      fs.unlinkSync(fp);
      console.log(`[ElevenLabs] Limpiado: ${f}`);
    }
  }
}

// ── Voces disponibles sugeridas (español) ────────────────────────────────────
// Puedes cambiar ELEVENLABS_VOICE_ID en .env a cualquiera de estas:
// EXAVITQu4vr4xnSDxMaL → Sarah   (femenina, cálida) ← default LidIA
// onwK4e9ZLuTAKqWW03F9 → Daniel  (masculino, neutral)
// pNInz6obpgDQGcFmaJgB → Adam    (masculino, formal)
// MF3mGyEYCl7XYWbV9V6O → Elli    (femenina, joven)
