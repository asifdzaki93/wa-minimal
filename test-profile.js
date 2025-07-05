const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

async function testProfileFeatures() {
  console.log('🧪 Testing Fitur Profil Kontak\n');
  
  // Test 1: Ambil profil kontak
  console.log('1️⃣ Testing: Ambil profil kontak');
  try {
    const response = await axios.get(`${BASE_URL}/profile/6287766305118`);
    console.log('✅ Profil kontak berhasil diambil:');
    console.log(JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.log('❌ Error ambil profil:', error.response?.data || error.message);
  }
  
  console.log('\n' + '='.repeat(50) + '\n');
  
  // Test 2: Ambil foto profil
  console.log('2️⃣ Testing: Ambil foto profil');
  try {
    const response = await axios.get(`${BASE_URL}/profile/6287766305118/photo`);
    console.log('✅ Foto profil berhasil diambil');
    console.log('URL foto:', response.request.res.responseUrl);
  } catch (error) {
    console.log('❌ Error ambil foto profil:', error.response?.data || error.message);
  }
  
  console.log('\n' + '='.repeat(50) + '\n');
  
  // Test 3: Ambil status kontak
  console.log('3️⃣ Testing: Ambil status kontak');
  try {
    const response = await axios.get(`${BASE_URL}/profile/6287766305118/status`);
    console.log('✅ Status kontak berhasil diambil:');
    console.log(JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.log('❌ Error ambil status:', error.response?.data || error.message);
  }
  
  console.log('\n' + '='.repeat(50) + '\n');
  
  // Test 4: Test dengan nomor yang tidak ada
  console.log('4️⃣ Testing: Nomor yang tidak ada');
  try {
    const response = await axios.get(`${BASE_URL}/profile/6289999999999`);
    console.log('✅ Response untuk nomor tidak ada:');
    console.log(JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.log('❌ Error untuk nomor tidak ada:', error.response?.data || error.message);
  }
}

// Jalankan test
testProfileFeatures().catch(console.error); 