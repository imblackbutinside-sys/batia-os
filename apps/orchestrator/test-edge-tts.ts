import path from 'path';
import fs from 'fs';

(async () => {
  try {
    console.log('🔍 Testing node-edge-tts with EdgeTTS class...');
    
    const mod = await import('node-edge-tts');
    const EdgeTTS = mod.EdgeTTS || (mod.default && mod.default.EdgeTTS) || mod.default;
    
    if (!EdgeTTS) {
      console.error('❌ EdgeTTS class not found in module');
      console.log('Module exports:', Object.keys(mod));
      process.exit(1);
    }
    
    console.log('✅ EdgeTTS class found');
    
    const tts = new EdgeTTS({ voice: 'ms-MY-YasminNeural', timeout: 10000 });
    console.log('✅ TTS instance created');
    
    const testFile = path.join(process.cwd(), 'test_edge_tts.mp3');
    const testText = 'Testing audio generation satu dua tiga';
    
    console.log('📝 Generating audio:', testText);
    console.log('💾 Saving to:', testFile);
    
    await tts.ttsPromise(testText, testFile);
    
    if (fs.existsSync(testFile)) {
      const stats = fs.statSync(testFile);
      console.log('✅ SUCCESS! File created');
      console.log('📊 Size:', stats.size, 'bytes');
      console.log('📅 Modified:', stats.mtime);
      
      if (stats.size < 1000) {
        console.warn('⚠️ Warning: File size very small, might be empty or corrupted');
      } else {
        console.log('🎵 Audio ready to play!');
      }
    } else {
      console.error('❌ File not created');
      process.exit(1);
    }
    
    process.exit(0);
    
  } catch (e: any) {
    console.error('❌ Error:', e.message);
    console.error('Stack:', e.stack);
    process.exit(1);
  }
})();