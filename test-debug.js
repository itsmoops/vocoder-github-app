#!/usr/bin/env node

// Debug testing script for Vocoder Localization App
import fetch from 'node-fetch'

const BASE_URL = 'http://localhost:3010'

async function testHealthCheck() {
  console.log('🏥 Testing health check...')
  try {
    const response = await fetch(`${BASE_URL}/health`)
    const data = await response.json()
    console.log('✅ Health check response:', JSON.stringify(data, null, 2))
  } catch (error) {
    console.error('❌ Health check failed:', error.message)
  }
}

async function testWebhookEvent(eventType, payload) {
  console.log(`\n🧪 Testing webhook event: ${eventType}`)
  try {
    const response = await fetch(`${BASE_URL}/debug/test`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ eventType, payload })
    })
    
    const data = await response.json()
    if (response.ok) {
      console.log('✅ Webhook test successful:', JSON.stringify(data, null, 2))
    } else {
      console.error('❌ Webhook test failed:', JSON.stringify(data, null, 2))
    }
  } catch (error) {
    console.error('❌ Webhook test error:', error.message)
  }
}

async function runTests() {
  console.log('🚀 Starting Vocoder Localization App Debug Tests\n')
  
  // Test health check
  await testHealthCheck()
  
  // Test pull request event
  await testWebhookEvent('pull_request.opened', {
    action: 'opened',
    pull_request: {
      number: 123,
      head: { sha: 'abc123' },
      base: { ref: 'main' }
    },
    repository: {
      owner: { login: 'testuser' },
      name: 'test-repo'
    },
    sender: { login: 'testuser' }
  })
  
  // Test push event
  await testWebhookEvent('push', {
    ref: 'refs/heads/main',
    after: 'def456',
    repository: {
      owner: { login: 'testuser' },
      name: 'test-repo'
    },
    sender: { login: 'testuser' }
  })
  
  console.log('\n🎉 Debug tests completed! Check the console for detailed logs.')
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().catch(console.error)
} 