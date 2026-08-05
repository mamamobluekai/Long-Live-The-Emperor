(async () => {
  const API_BASE = 'http://localhost:5000/api';
  
  try {
    // Login
    const loginRes = await fetch(`${API_BASE}/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email: 'admin1@wims.edu.ph', password: 'admin123' })
    });
    const loginData = await loginRes.json();
    console.log('1. Login:', loginRes.status, loginData.message);
    
    const token = loginData.accessToken;
    const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    
    // 2. Get profile
    const profileRes = await fetch(`${API_BASE}/admin/profile`, { headers: { Authorization: `Bearer ${token}` } });
    const profileData = await profileRes.json();
    console.log('2. Get profile:', profileRes.status, `email: ${profileData.user?.email}, photo_url: ${profileData.user?.photo_url || 'none'}`);
    
    // 3. Update profile (name)
    const updateRes = await fetch(`${API_BASE}/admin/profile`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({ first_name: 'Maria', last_name: 'Santos Jr.' })
    });
    const updateData = await updateRes.json();
    console.log('3. Update profile:', updateRes.status, `name: ${updateData.user?.first_name} ${updateData.user?.last_name}`);
    
    // 4. Change password
    const pwRes = await fetch(`${API_BASE}/admin/profile/password`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({ currentPassword: 'admin123', newPassword: 'newpass123' })
    });
    const pwData = await pwRes.json();
    console.log('4. Change password:', pwRes.status, pwData.message);
    
    // 5. Verify new password works
    const login2Res = await fetch(`${API_BASE}/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email: 'admin1@wims.edu.ph', password: 'newpass123' })
    });
    console.log('5. Login with new pw:', login2Res.status, login2Res.ok ? 'OK' : 'FAIL');
    
    // 6. Try wrong current password
    const badPwRes = await fetch(`${API_BASE}/admin/profile/password`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({ currentPassword: 'wrongpassword', newPassword: 'anotherpass123' })
    });
    const badPwData = await badPwRes.json();
    console.log('6. Wrong current pw:', badPwRes.status, badPwData.error);
    
    // Reset password back
    const resetRes = await fetch(`${API_BASE}/admin/profile/password`, {
      method: 'PATCH',
      headers: authHeaders,
      body: JSON.stringify({ currentPassword: 'newpass123', newPassword: 'admin123' })
    });
    console.log('7. Reset pw back:', resetRes.status);
    
  } catch(e) {
    console.error('Error:', e.message);
  }
})();
