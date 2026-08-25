/**
 * server/lib/media-analysis.js
 *
 * Staff-submitted video/audio for the exam — a phone clip of the pet's gait,
 * a recording of an owner describing symptoms, auscultation audio, etc. Runs
 * it through OpenAI and hands back a plain-text clinical observation the
 * exam report can carry alongside the six instrument systems, without
 * folding it into fusion-engine.js's risk-scoring model — this is narrative
 * supporting evidence for the vet to read, not another scored system.
 *
 * Audio: transcribed directly (Whisper), then summarized into a clean
 * clinical-observation paragraph — the raw transcript alone is often
 * disfluent ("um", false starts) and not what a vet wants to read first.
 *
 * Video: ffmpeg-static (bundled binary, no system install needed — same
 * reasoning as avoiding Puppeteer elsewhere in this app: no extra OS-level
 * dependency to fail on Render) extracts a handful of evenly-spaced frames
 * and, separately, the audio track if one exists. Frames go to the model as
 * images; the audio (if any) is transcribed the same way as a standalone
 * audio upload. Both feed one combined analysis pass.
 *
 * No OPENAI_API_KEY configured -> { analysis: null, reason: 'no_api_key' },
 * same graceful-degradation contract as ai-narrative.js/ai-assessment.js.
 */
const express = require('express');
const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const multer = require('multer');
const ffmpegPath = require('ffmpeg-static');
const { requireAuth, requireRole } = require('./auth');
const { ah } = require('./async-handler');

const MODEL = process.env.OPENAI_MODEL || 'gpt-5.6';
const TRANSCRIBE_MODEL = process.env.OPENAI_TRANSCRIBE_MODEL || 'whisper-1';

const VIDEO_MIMETYPES = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska'];
const AUDIO_MIMETYPES = ['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/x-wav', 'audio/webm', 'audio/x-m4a', 'audio/ogg', 'audio/aac'];

// Disk, not memory — ffmpeg needs a real file path to read from, and a clip
// can run tens of MB, which is worth keeping off the heap on a free-tier box.
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, os.tmpdir()),
    filename: (req, file, cb) => cb(null, `vitarus-media-${crypto.randomUUID()}${path.extname(file.originalname || '')}`)
  }),
  limits: { fileSize: 60 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    if (![...VIDEO_MIMETYPES, ...AUDIO_MIMETYPES].includes(file.mimetype)) {
      return cb(new Error('Only common video (mp4/mov/webm/mkv) or audio (mp3/mp4/wav/webm/m4a/ogg/aac) files are allowed'));
    }
    cb(null, true);
  }
});
function uploadMediaMw(req, res, next) {
  upload.single('media')(req, res, err => {
    if (err) return res.status(400).json({ error: err.message || 'invalid media upload' });
    next();
  });
}

function run(bin, args) {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { maxBuffer: 1024 * 1024 * 16 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr?.toString().slice(-800) || err.message));
      resolve({ stdout, stderr });
    });
  });
}

async function extractFrames(inputPath, outDir) {
  const pattern = path.join(outDir, 'frame_%02d.jpg');
  // One frame every 3s, capped at 6 — enough to catch a gait cycle or a few
  // seconds of behavior without sending a large image batch to the model.
  await run(ffmpegPath, ['-y', '-i', inputPath, '-vf', 'fps=1/3', '-frames:v', '6', '-q:v', '3', pattern]);
  const files = (await fsp.readdir(outDir)).filter(f => f.startsWith('frame_')).sort();
  return files.map(f => path.join(outDir, f));
}

async function extractAudioTrack(inputPath, outDir) {
  const outPath = path.join(outDir, 'audio.mp3');
  try {
    await run(ffmpegPath, ['-y', '-i', inputPath, '-vn', '-acodec', 'libmp3lame', '-q:a', '4', outPath]);
    const stat = await fsp.stat(outPath).catch(() => null);
    // A few hundred bytes of MP3 header with silence is not a real audio
    // track — treat as "no usable audio" rather than transcribing nothing.
    if (!stat || stat.size < 2000) return null;
    return outPath;
  } catch {
    return null; // no audio stream on this clip — not an error, just absent
  }
}

async function transcribe(client, filePath) {
  const res = await client.audio.transcriptions.create({
    file: fs.createReadStream(filePath),
    model: TRANSCRIBE_MODEL
  });
  return (res.text || '').trim();
}

async function summarizeTranscript(client, transcript, patient) {
  const response = await client.responses.create({
    model: MODEL,
    instructions: 'You turn a raw, disfluent spoken transcript from a veterinary exam room into one clean, plain-language clinical observation paragraph. Keep every concrete detail (symptoms, timing, body parts, behavior). Drop filler words and false starts. Never invent detail that was not said. Decision support only — no diagnosis.',
    input: [{ role: 'user', content: `Patient: ${patient?.name || 'Unnamed'}, ${patient?.species || 'Canine'}${patient?.breed ? ', ' + patient.breed : ''}.\n\nRaw transcript:\n${transcript}` }]
  });
  let text = '';
  for (const item of response.output || []) {
    if (item.type !== 'message') continue;
    for (const part of item.content || []) if (part.type === 'output_text' && part.text) text += part.text;
  }
  return text.trim() || transcript;
}

async function analyzeFramesWithTranscript(client, framePaths, transcript, patient) {
  const imageParts = await Promise.all(framePaths.map(async p => ({
    type: 'input_image',
    image_url: `data:image/jpeg;base64,${(await fsp.readFile(p)).toString('base64')}`
  })));
  const textPrompt = `Patient: ${patient?.name || 'Unnamed'}, ${patient?.species || 'Canine'}${patient?.breed ? ', ' + patient.breed : ''}.\n\n`
    + `These ${imageParts.length} frames are sampled evenly across a video clip submitted during this patient's exam.`
    + (transcript ? ` The clip's audio track was transcribed as: "${transcript}"` : ' The clip has no audio track.')
    + `\n\nDescribe, in one plain-language clinical-observation paragraph, what is visibly notable across the frames (posture, gait, visible lesions/asymmetry, behavior) and incorporate anything said in the audio. State only what is actually visible/said — do not speculate beyond it. Decision support only, not a diagnosis.`;

  const response = await client.responses.create({
    model: MODEL,
    instructions: 'You are a veterinary decision-support assistant describing what is observable in submitted exam video. Never state a definitive diagnosis.',
    input: [{ role: 'user', content: [{ type: 'input_text', text: textPrompt }, ...imageParts] }]
  });
  let text = '';
  for (const item of response.output || []) {
    if (item.type !== 'message') continue;
    for (const part of item.content || []) if (part.type === 'output_text' && part.text) text += part.text;
  }
  return text.trim();
}

function router() {
  const r = express.Router();

  r.post('/media-analysis', requireAuth, requireRole('staff', 'vet', 'admin', 'super_admin'), uploadMediaMw, ah(async (req, res) => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      if (req.file) await fsp.unlink(req.file.path).catch(() => {});
      return res.json({ analysis: null, reason: 'no_api_key' });
    }
    if (!req.file) return res.status(400).json({ error: 'a media file is required (field name "media")' });

    const isVideo = VIDEO_MIMETYPES.includes(req.file.mimetype);
    const patient = (() => { try { return JSON.parse(req.body.patient || '{}'); } catch { return {}; } })();
    const workDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'vitarus-media-'));

    try {
      const OpenAI = require('openai');
      const client = new OpenAI({ apiKey });

      if (!isVideo) {
        const transcript = await transcribe(client, req.file.path);
        if (!transcript) return res.json({ kind: 'audio', transcript: '', analysis: null, reason: 'empty_transcript' });
        const analysis = await summarizeTranscript(client, transcript, patient);
        return res.json({ kind: 'audio', transcript, analysis });
      }

      const [framePaths, audioPath] = await Promise.all([
        extractFrames(req.file.path, workDir),
        extractAudioTrack(req.file.path, workDir)
      ]);
      const transcript = audioPath ? await transcribe(client, audioPath) : '';
      if (!framePaths.length) {
        if (!transcript) return res.json({ kind: 'video', transcript: '', analysis: null, reason: 'no_frames_or_audio' });
        const analysis = await summarizeTranscript(client, transcript, patient);
        return res.json({ kind: 'video', transcript, analysis });
      }
      const analysis = await analyzeFramesWithTranscript(client, framePaths, transcript, patient);
      res.json({ kind: 'video', transcript, analysis });
    } catch (err) {
      console.error('Media analysis failed:', err.message);
      res.json({ analysis: null, reason: 'api_error', message: err.message });
    } finally {
      await fsp.unlink(req.file.path).catch(() => {});
      await fsp.rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
  }));

  return r;
}

module.exports = { router };
