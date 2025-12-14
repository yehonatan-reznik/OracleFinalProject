/**
 * Oracle Final Project - Frontend Configuration
 * 
 * This file centralizes the API URL configuration. 
 * Uncomment the appropriate line for your environment.
 */

// 1. Local Simulation (Default)
const API_BASE_URL = "http://localhost:3000";

// 2. Oracle Cloud VM (Production)
// Replace <VM_PUBLIC_IP> with the actual IP from Terraform output (e.g., 129.x.x.x)
// const API_BASE_URL = "http://<VM_PUBLIC_IP>:3000";

console.log(`[Config] API Base URL set to: ${API_BASE_URL}`);
