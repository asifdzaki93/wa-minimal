import axios from 'axios';

const BASE_URL = 'http://localhost:3000';

// Contoh data kontak untuk testing
const testContacts = [
  { number: '6287766305118', name: 'Test User 1' },
  { number: '6287766305118', name: 'Test User 2' },
  { number: '6287766305118', name: 'Test User 3' }
];

async function testBulkMessageFeatures() {
  console.log('🧪 Testing Fitur Bulk Message\n');
  
  // Test 1: Cek koneksi
  console.log('1️⃣ Testing: Cek koneksi WhatsApp');
  try {
    const response = await axios.get(`${BASE_URL}/status`);
    console.log('✅ Status koneksi:', response.data);
  } catch (error) {
    console.log('❌ Error cek koneksi:', error.response?.data || error.message);
    return;
  }
  
  console.log('\n' + '='.repeat(50) + '\n');
  
  // Test 2: Ambil daftar kontak
  console.log('2️⃣ Testing: Ambil daftar kontak');
  try {
    const response = await axios.get(`${BASE_URL}/contacts`);
    const contacts = response.data;
    console.log(`✅ Ditemukan ${contacts.length} kontak`);
    
    if (contacts.length > 0) {
      console.log('📋 Sample kontak:');
      contacts.slice(0, 3).forEach((contact, index) => {
        console.log(`   ${index + 1}. ${contact.name} (${contact.id})`);
      });
    }
  } catch (error) {
    console.log('❌ Error ambil kontak:', error.response?.data || error.message);
  }
  
  console.log('\n' + '='.repeat(50) + '\n');
  
  // Test 3: Test pengiriman pesan tunggal
  console.log('3️⃣ Testing: Pengiriman pesan tunggal');
  try {
    const testMessage = `Test pesan dari sistem bulk message
Waktu: ${new Date().toLocaleString('id-ID')}
ID: ${Math.floor(Math.random() * 1000) + 1}`;
    
    const response = await axios.post(`${BASE_URL}/send-text`, {
      number: '6287766305118',
      message: testMessage
    });
    
    console.log('✅ Pesan berhasil dikirim:', response.data);
  } catch (error) {
    console.log('❌ Error kirim pesan:', error.response?.data || error.message);
  }
  
  console.log('\n' + '='.repeat(50) + '\n');
  
  // Test 4: Simulasi bulk sending (3 pesan dengan delay)
  console.log('4️⃣ Testing: Simulasi bulk sending (3 pesan)');
  try {
    for (let i = 0; i < 3; i++) {
      const personalizedMessage = `Halo Test User ${i + 1}!

Ini adalah pesan test dari sistem bulk message.
Waktu: ${new Date().toLocaleString('id-ID')}
ID Pesan: ${Math.floor(Math.random() * 1000) + 1}

Salam,
Tim Testing`;

      console.log(`📤 Mengirim pesan ${i + 1}/3...`);
      
      const response = await axios.post(`${BASE_URL}/send-text`, {
        number: '6287766305118',
        message: personalizedMessage
      });
      
      console.log(`✅ Pesan ${i + 1} berhasil:`, response.data.status);
      
      // Delay 10 detik antara pesan (untuk testing)
      if (i < 2) {
        console.log('⏳ Menunggu 10 detik sebelum pesan berikutnya...');
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    }
    
    console.log('✅ Simulasi bulk sending selesai!');
  } catch (error) {
    console.log('❌ Error bulk sending:', error.response?.data || error.message);
  }
  
  console.log('\n' + '='.repeat(50) + '\n');
  
  // Test 5: Cek fitur profil kontak
  console.log('5️⃣ Testing: Cek profil kontak');
  try {
    const response = await axios.get(`${BASE_URL}/profile/6287766305118`);
    console.log('✅ Profil kontak:', {
      number: response.data.number,
      name: response.data.name,
      hasBusinessProfile: !!response.data.businessProfile,
      hasProfilePicture: !!response.data.profilePicture
    });
  } catch (error) {
    console.log('❌ Error cek profil:', error.response?.data || error.message);
  }
  
  console.log('\n' + '='.repeat(50) + '\n');
  
  console.log('🎉 Testing selesai!');
  console.log('\n📝 Catatan untuk penggunaan bulk.html:');
  console.log('1. Akses http://localhost:3000/bulk.html');
  console.log('2. Pastikan WhatsApp sudah terhubung');
  console.log('3. Load kontak dari berbagai sumber');
  console.log('4. Atur template pesan dengan variabel {{name}}, {{number}}, dll');
  console.log('5. Konfigurasi delay dan batch size untuk keamanan');
  console.log('6. Mulai pengiriman massal');
}

// Jalankan test
testBulkMessageFeatures().catch(console.error); 