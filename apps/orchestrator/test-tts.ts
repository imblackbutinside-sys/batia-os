import { MsEdgeTTS, OUTPUT_FORMAT } from 'node-edge-tts';
import fs from 'fs';
import path from 'path';

(async () => {
  try {
    console.log('Testing node-edge-tts...');
    const tts = new MsEdgeTTS();
    await tts.setMetadata('ms-MY-YasminNeural', OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    
    const readable = tts.toStream('Testing audio generation satu dua tiga');
    const testFile = path.join(process.cwd(), 'test_tts_output.mp3');
    const writable = fs.createWriteStream(testFile);
    
    readable.pipe(writable);
    
    writable.on('finish', () => {
      const stats = fs.statSync(testFile);
      console.log('✅ SUCCESS! Audio generated at:', testFile);
      console.log('✅ Size:', stats.size, 'bytes');
      process.exit(0);
    });
    
    writable.on('error', (err) => {
      console.error('❌ Write error:', err.message);
      process.exit(1);
    });
    
  } catch (e: any) {
    console.error('❌ TTS error:', e.message);
    process.exit(1);
  }
})();
