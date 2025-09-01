#!/usr/bin/env node

/**
 * Test script for Vocoder Localization App debug endpoints
 * Tests the health check and webhook simulation endpoints
 */

const BASE_URL = 'http://localhost:3011'

async function testEndpoint(url, options = {}) {
  try {
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers: options.headers || {},
      body: options.body || null
    })
    
    const data = await response.json()
    
    console.log(`✅ ${options.method || 'GET'} ${url} - ${response.status}`)
    console.log('Response:', JSON.stringify(data, null, 2))
    console.log('---')
    
    return { success: true, data, status: response.status }
  } catch (error) {
    console.error(`❌ ${options.method || 'GET'} ${url} - Error:`, error.message)
    console.log('---')
    return { success: false, error: error.message }
  }
}

async function runTests() {
  console.log('🧪 Testing Vocoder Localization App Debug Endpoints\n')
  
  // Test 1: Health Check
  console.log('1️⃣ Testing Health Check Endpoint')
  await testEndpoint(`${BASE_URL}/health`)
  
  // Test 2: Debug Test Endpoint (Simulate PR opened)
  console.log('2️⃣ Testing Debug Test Endpoint (PR opened)')
  await testEndpoint(`${BASE_URL}/debug/test`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    }
  })
  
  console.log('🎉 All tests completed!')
  console.log('\n📝 Check the server logs above for detailed processing information.')
  console.log('💡 The debug endpoint simulates a pull request being opened and processes it through the new workflow.')
}

// Run tests
runTests().catch(console.error) 