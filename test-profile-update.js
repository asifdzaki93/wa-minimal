import axios from 'axios';
import fs from 'fs';

const BASE_URL = 'http://localhost:3000';

async function testProfileUpdateFeatures() {
  console.log('🧪 Testing Fitur Update Profil Kontak\n');
  
  // Test 1: Update profil kontak tunggal
  console.log('1️⃣ Testing: Update profil kontak tunggal');
  try {
    const response = await axios.post(`${BASE_URL}/profile/6287766305118/update`);
    console.log('✅ Update profil berhasil:');
    console.log(JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.log('❌ Error update profil:', error.response?.data || error.message);
  }
  
  console.log('\n' + '='.repeat(50) + '\n');
  
  // Test 2: Refresh semua profil kontak
  console.log('2️⃣ Testing: Refresh semua profil kontak');
  try {
    const response = await axios.post(`${BASE_URL}/contacts/refresh-profiles`);
    console.log('✅ Refresh semua profil berhasil:');
    console.log(JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.log('❌ Error refresh semua profil:', error.response?.data || error.message);
  }
  
  console.log('\n' + '='.repeat(50) + '\n');
  
  // Test 3: Cek kontak setelah update
  console.log('3️⃣ Testing: Cek kontak setelah update');
  try {
    const response = await axios.get(`${BASE_URL}/contacts`);
    const contacts = response.data;
    
    // Cari kontak yang baru diupdate
    const updatedContact = contacts.find(c => c.id === '6287766305118@s.whatsapp.net');
    
    if (updatedContact) {
      console.log('✅ Kontak setelah update:');
      console.log(`📱 Nomor: ${updatedContact.number}`);
      console.log(`📛 Nama: ${updatedContact.name || 'Tidak tersedia'}`);
      console.log(`💬 Status: ${updatedContact.status || 'Tidak tersedia'}`);
      console.log(`📸 Foto: ${updatedContact.profilePicture ? 'Ada' : 'Tidak ada'}`);
      console.log(`🏢 Business Profile: ${updatedContact.businessProfile ? 'Ada' : 'Tidak ada'}`);
      console.log(`🕒 Updated At: ${updatedContact.updatedAt || 'Tidak ada'}`);
    } else {
      console.log('❌ Kontak tidak ditemukan setelah update');
    }
  } catch (error) {
    console.log('❌ Error cek kontak:', error.response?.data || error.message);
  }
  
  console.log('\n' + '='.repeat(50) + '\n');
  
  // Test 4: Cek file cache
  console.log('4️⃣ Testing: Cek file cache kontak');
  try {
    if (fs.existsSync('./contacts_cache.json')) {
      const cacheData = JSON.parse(fs.readFileSync('./contacts_cache.json', 'utf8'));
      console.log(`✅ File cache ditemukan: ${cacheData.length} kontak`);
      
      // Cek kontak yang diupdate
      const cachedContact = cacheData.find(c => c.id === '6287766305118@s.whatsapp.net');
      if (cachedContact) {
        console.log('✅ Kontak tersimpan di cache:');
        console.log(`📱 Nomor: ${cachedContact.number}`);
        console.log(`📛 Nama: ${cachedContact.name || 'Tidak tersedia'}`);
        console.log(`💬 Status: ${cachedContact.status || 'Tidak tersedia'}`);
        console.log(`📸 Foto: ${cachedContact.profilePicture ? 'Ada' : 'Tidak ada'}`);
        console.log(`🏢 Business Profile: ${cachedContact.businessProfile ? 'Ada' : 'Tidak ada'}`);
        console.log(`🕒 Updated At: ${cachedContact.updatedAt || 'Tidak ada'}`);
      }
    } else {
      console.log('❌ File cache tidak ditemukan');
    }
  } catch (error) {
    console.log('❌ Error cek file cache:', error.message);
  }
}

// Jalankan test
testProfileUpdateFeatures().catch(console.error); 