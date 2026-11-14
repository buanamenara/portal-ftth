#!/usr/bin/env node
// Test verifikasi refresh speed dan cache hit pada endpoint Waspang GET_CLUSTER
const DEP_URL = 'https://script.google.com/macros/s/AKfycbw4TJYefbBIIoBS4Kztyv2lClvmngtIMotFbSLfp_E6ptKjv0qVwDBg_ppR1fY8zGKG/exec';

async function testEndpoint(cluster, sow) {
  console.log(`\n=== Testing Cluster: ${cluster} (SOW: ${sow}) ===`);

  // Call 1: Cold Read / Populate Cache
  console.log('1. Memanggil GET_CLUSTER (panggilan pertama / populate cache)...');
  const t0 = Date.now();
  const res1 = await fetch(DEP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'GET_CLUSTER', cluster: cluster, name: cluster, sow: sow }),
    redirect: 'follow'
  });
  const data1 = await res1.json();
  const dur1 = Date.now() - t0;
  console.log(`   Durasi Panggilan 1: ${dur1} ms | Status: ${data1.status} | Found: ${data1.found}`);
  if (data1.durMs !== undefined) console.log(`   Server Internal Exec: ${data1.durMs} ms (cached: ${data1.cached})`);

  // Call 2: Hot Read / Hit Cache
  console.log('2. Memanggil GET_CLUSTER (panggilan kedua berurutan / test cache hit)...');
  const t1 = Date.now();
  const res2 = await fetch(DEP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'GET_CLUSTER', cluster: cluster, name: cluster, sow: sow }),
    redirect: 'follow'
  });
  const data2 = await res2.json();
  const dur2 = Date.now() - t1;
  console.log(`   Durasi Panggilan 2: ${dur2} ms | Status: ${data2.status} | Found: ${data2.found}`);
  if (data2.durMs !== undefined) console.log(`   Server Internal Exec: ${data2.durMs} ms (cached: ${data2.cached})`);

  console.log(`   🚀 Selisih kecepatan: Panggilan 2 ${dur1 > dur2 ? (dur1 / dur2).toFixed(1) + 'x lebih cepat' : 'setara'}`);
}

async function run() {
  await testEndpoint('SUNGAI KUPANG', 'Cluster');
  await testEndpoint('PENGGALAMAN', 'Cluster');
}

run().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
