(function () {
  'use strict';

  // ========== Gmail API Configuration ==========
  const CLIENT_ID = '401370888475-qfvapnj1nir1tn9sq41q7qqQt34fa5vg.apps.googleusercontent.com';
  const SCOPES = ['https://www.googleapis.com/auth/gmail.send'];
  
  let gapiLoaded = false;
  let gisLoaded = false;
  let tokenClient;
  let accessToken = null;

  // ========== DOM Elements ==========
  const toggleBtn = document.getElementById('toggle-customer');
  const customerFields = document.getElementById('customer-fields');
  const printBtn = document.getElementById('print-page');
  const sendEmailBtn = document.getElementById('send-email');
  const editor = document.getElementById('letter-body');
  const toolbar = document.querySelector('.editor-toolbar');
  const googleSigninDiv = document.getElementById('google-signin');

  toggleBtn.addEventListener('click', () => {
    const willShow = customerFields.hidden;
    customerFields.hidden = !willShow;
    toggleBtn.setAttribute('aria-expanded', String(willShow));
    if (willShow) document.getElementById('customer-name').focus();
  });

  printBtn.addEventListener('click', () => window.print());

  toolbar.addEventListener('mousedown', (event) => {
    // Keep the caret in the editor when a toolbar button is pressed.
    if (event.target.closest('button')) event.preventDefault();
  });

  toolbar.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-command]');
    if (!button) return;

    editor.focus();
    const command = button.dataset.command;
    const value = button.dataset.value || null;
    document.execCommand(command, false, value);
  });

  editor.addEventListener('keydown', (event) => {
    if (event.key === 'Tab') {
      event.preventDefault();
      document.execCommand('insertText', false, '    ');
    }
  });

  // Paste as plain text so pasted content adopts the letterhead styling.
  editor.addEventListener('paste', (event) => {
    event.preventDefault();
    const text = (event.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, text);
  });

  // ========== Build Number / Version ==========
  const buildNumber = document.getElementById('build-number');
  if (buildNumber) {
    const buildDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const buildTime = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' });
    buildNumber.textContent = `${buildDate} ${buildTime}`;
  }

  // ========== Gmail Integration ==========
  
  /**
   * Initialize OAuth token client
   */
  function initializeTokenClient() {
    try {
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES.join(' '),
        callback: (tokenResponse) => {
          if (tokenResponse.error !== undefined) {
            console.error('OAuth error:', tokenResponse.error);
            alert('Authentication failed: ' + tokenResponse.error);
            return;
          }
          accessToken = tokenResponse.access_token;
          console.log('Access token obtained');
          sendEmail();
        },
      });
      gisLoaded = true;
      console.log('Token client initialized');
    } catch (error) {
      console.error('Failed to initialize token client:', error);
    }
  }

  /**
   * Request OAuth access token
   */
  function requestAccessToken() {
    if (tokenClient) {
      // Request without a hint - will show account selection/login
      tokenClient.requestAccessToken({ hint: '' });
    } else {
      alert('Google authentication not ready. Please refresh the page.');
    }
  }

  /**
   * Send email via Gmail API
   */
  async function sendEmail() {
    const customerEmail = document.getElementById('customer-email').value;
    const letterContent = editor.innerHTML;

    if (!customerEmail) {
      alert('Please enter a customer email address.');
      return;
    }

    if (!letterContent.trim()) {
      alert('Please write a letter before sending.');
      return;
    }

    if (!accessToken) {
      alert('Not authenticated. Please click "Send via Gmail" again.');
      return;
    }

    try {
      // Create email message
      const emailSubject = 'Message from North Texas Elite Pool Care';
      const emailHeaders = `To: ${customerEmail}\r\nSubject: ${emailSubject}\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n`;
      const emailBody = emailHeaders + letterContent;

      // Base64 encode the message (RFC 4648 safe alphabet)
      const encodedMessage = btoa(unescape(encodeURIComponent(emailBody)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      const response = await fetch('https://www.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          raw: encodedMessage,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Gmail API error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
      }

      const result = await response.json();
      alert(`✅ Email sent successfully to ${customerEmail}!`);
      console.log('Message sent. ID:', result.id);
    } catch (error) {
      console.error('Error sending email:', error);
      alert('Failed to send email: ' + error.message);
    }
  }

  /**
   * Send Email button click handler
   */
  sendEmailBtn.addEventListener('click', () => {
    if (!accessToken) {
      if (gisLoaded) {
        requestAccessToken();
      } else {
        alert('Google authentication not ready. Please refresh the page.');
      }
    } else {
      sendEmail();
    }
  });

  // Initialize token client when page loads
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeTokenClient);
  } else {
    initializeTokenClient();
  }
})();
