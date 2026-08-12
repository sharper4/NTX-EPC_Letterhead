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

  // ========== Gmail Integration ==========
  
  /**
   * Callback after Google API is loaded
   */
  window.onload = function () {
    gapiInit();
  };

  /**
   * Initialize Google Sign-In
   */
  function gapiInit() {
    google.accounts.id.initialize({
      client_id: CLIENT_ID,
      callback: handleCredentialResponse,
    });
    gisLoaded = true;
  }

  /**
   * Handle credential response from Google Sign-In
   */
  function handleCredentialResponse(response) {
    // The response contains the JWT (ID token)
    // For Gmail API, we need to use the OAuth flow instead
    console.log('ID token received, initiating OAuth flow...');
    requestAccessToken();
  }

  /**
   * Request OAuth access token
   */
  function requestAccessToken() {
    if (tokenClient) {
      tokenClient.requestAccessToken();
    }
  }

  /**
   * Initialize OAuth token client
   */
  function initializeTokenClient() {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES.join(' '),
      callback: (tokenResponse) => {
        if (tokenResponse.error !== undefined) {
          throw tokenResponse;
        }
        accessToken = tokenResponse.access_token;
        console.log('Access token obtained:', accessToken.substring(0, 20) + '...');
        sendEmail();
      },
    });
  }

  /**
   * Show Google Sign-In button
   */
  function showSignIn() {
    if (gisLoaded && googleSigninDiv) {
      google.accounts.id.renderButton(googleSigninDiv, {
        theme: 'outline',
        size: 'large',
        text: 'signin_with',
      });
      googleSigninDiv.style.display = 'block';
    }
  }

  /**
   * Send email via Gmail API
   */
  async function sendEmail() {
    const customerName = document.getElementById('customer-name').value || 'Valued Customer';
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
      alert('Not authenticated. Please sign in first.');
      showSignIn();
      return;
    }

    // Compose the email message
    const emailBody = `To: ${customerEmail}\r\nSubject: Message from North Texas Elite Pool Care\r\nContent-Type: text/html; charset="UTF-8"\r\n\r\n${letterContent}`;

    // Base64 encode the message
    const encodedMessage = btoa(emailBody).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    try {
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
        throw new Error(`Gmail API error: ${response.status}`);
      }

      const result = await response.json();
      alert(`Email sent successfully to ${customerEmail}!`);
      console.log('Message sent. Message ID:', result.id);
    } catch (error) {
      console.error('Error sending email:', error);
      alert('Failed to send email. Check the console for details.');
    }
  }

  /**
   * Send Email button click handler
   */
  sendEmailBtn.addEventListener('click', () => {
    if (!accessToken) {
      // User needs to authenticate
      if (!tokenClient) {
        initializeTokenClient();
      }
      showSignIn();
      // After sign-in, the tokenClient callback will trigger sendEmail()
      requestAccessToken();
    } else {
      // Already authenticated, send directly
      sendEmail();
    }
  });

  // Initialize token client on page load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initializeTokenClient();
    });
  } else {
    initializeTokenClient();
  }
})();
