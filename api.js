// api.js - Shared HTTP client for Shivam ERP Backend
const API_BASE = 'http://localhost:5000/api';

const api = {
  getToken: () => localStorage.getItem('erp_token'),
  getUser: () => JSON.parse(localStorage.getItem('erp_user') || 'null'),
  
  logout: () => {
    localStorage.removeItem('erp_token');
    localStorage.removeItem('erp_user');
    window.location.reload();
  },

  async request(endpoint, options = {}) {
    const token = this.getToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
      const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers: { ...headers, ...options.headers }
      });
      const data = await response.json();
      
      if (response.status === 401) {
        this.logout(); // Token expired or invalid
      }
      
      if (!response.ok) {
        throw new Error(data.message || 'API Request Failed');
      }
      return data;
    } catch (err) {
      console.error(`API Error on ${endpoint}:`, err);
      // alert(err.message);
      throw err;
    }
  },

  async get(endpoint) {
    return this.request(endpoint, { method: 'GET' });
  },

  async post(endpoint, body) {
    return this.request(endpoint, { method: 'POST', body: JSON.stringify(body) });
  },

  async put(endpoint, body) {
    return this.request(endpoint, { method: 'PUT', body: JSON.stringify(body) });
  },

  async patch(endpoint, body) {
    return this.request(endpoint, { method: 'PATCH', body: JSON.stringify(body) });
  },

  async del(endpoint) {
    return this.request(endpoint, { method: 'DELETE' });
  }
};
