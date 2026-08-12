(function () {
  'use strict';

  // ========== Gmail API Configuration ==========
  const CLIENT_ID = '401370888475-3mo4smpbf7r0l39gmk776d2g1vird0eu.apps.googleusercontent.com';
  const SCOPES = ['https://www.googleapis.com/auth/gmail.send'];
  
  let gapiLoaded = false;
  let gisLoaded = false;
  let tokenClient;
  let accessToken = null;
  let pendingSendEmailAddress = null;

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
  function initBuildNumber() {
    const badge = document.getElementById('build-badge');
    if (!badge) {
      console.warn('Build badge element not found');
      return;
    }

    const modified = new Date(document.lastModified);
    if (Number.isNaN(modified.getTime())) {
      badge.textContent = 'Build live';
      return;
    }

    const year = modified.getFullYear();
    const month = String(modified.getMonth() + 1).padStart(2, '0');
    const day = String(modified.getDate()).padStart(2, '0');
    const hour = String(modified.getHours()).padStart(2, '0');
    const minute = String(modified.getMinutes()).padStart(2, '0');
    badge.textContent = `Build ${year}.${month}.${day}.${hour}${minute}`;
    console.log('Build number updated:', badge.textContent);
  }

  // ========== Gmail Integration ==========
  
  /**
   * Initialize OAuth token client
   */
  function initializeTokenClient() {
    try {
      if (!window.google || !window.google.accounts || !window.google.accounts.oauth2) {
        console.error('Google library not loaded yet');
        setTimeout(initializeTokenClient, 500);
        return;
      }

      tokenClient = window.google.accounts.oauth2.initTokenClient({
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
          sendEmailFlow();
        },
      });
      gisLoaded = true;
      console.log('Token client initialized successfully');
    } catch (error) {
      console.error('Failed to initialize token client:', error);
      setTimeout(initializeTokenClient, 500);
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
   * Show a custom modal prompting for an email address, falling back to
   * window.prompt if the modal markup isn't present for some reason.
   */
  function promptForEmailAddress(defaultValue) {
    return new Promise((resolve) => {
      const overlay = document.getElementById('email-modal-overlay');
      const input = document.getElementById('email-modal-input');
      const confirmBtn = document.getElementById('email-modal-confirm');
      const cancelBtn = document.getElementById('email-modal-cancel');

      if (!overlay || !input || !confirmBtn || !cancelBtn) {
        resolve(window.prompt('Enter the email address to send this letter to:', defaultValue || '') || '');
        return;
      }

      input.value = defaultValue || '';
      overlay.hidden = false;
      input.focus();
      input.select();

      function cleanup(result) {
        overlay.hidden = true;
        confirmBtn.removeEventListener('click', onConfirm);
        cancelBtn.removeEventListener('click', onCancel);
        overlay.removeEventListener('click', onOverlayClick);
        input.removeEventListener('keydown', onKeydown);
        resolve(result);
      }

      function onConfirm() {
        cleanup(input.value.trim());
      }

      function onCancel() {
        cleanup('');
      }

      function onOverlayClick(event) {
        if (event.target === overlay) cleanup('');
      }

      function onKeydown(event) {
        if (event.key === 'Enter') {
          event.preventDefault();
          onConfirm();
        } else if (event.key === 'Escape') {
          onCancel();
        }
      }

      confirmBtn.addEventListener('click', onConfirm);
      cancelBtn.addEventListener('click', onCancel);
      overlay.addEventListener('click', onOverlayClick);
      input.addEventListener('keydown', onKeydown);
    });
  }

  /**
   * Resolve the email address to send to, prompting via a modal when the
   * customer section is collapsed or no email has been entered yet.
   */
  async function resolveCustomerEmailAddress() {
    const emailInput = document.getElementById('customer-email');
    const currentEmail = (emailInput.value || '').trim();
    const shouldPrompt = customerFields.hidden || !currentEmail;

    if (!shouldPrompt) {
      return currentEmail;
    }

    const promptValue = await promptForEmailAddress(currentEmail);
    if (!promptValue) {
      return '';
    }

    emailInput.value = promptValue;
    return promptValue;
  }

  /**
   * Resolve the recipient, request Gmail authorization if needed, then send.
   */
  async function sendEmailFlow() {
    const customerEmail = pendingSendEmailAddress || await resolveCustomerEmailAddress();

    if (!customerEmail) {
      pendingSendEmailAddress = null;
      return;
    }
    pendingSendEmailAddress = customerEmail;

    if (!accessToken) {
      if (gisLoaded) {
        requestAccessToken();
      } else {
        alert('Google authentication not ready. Please refresh the page.');
        pendingSendEmailAddress = null;
      }
      return;
    }

    await sendEmail(customerEmail);
  }

  /**
   * Send email via Gmail API
   */
  async function sendEmail(customerEmail) {
    customerEmail = customerEmail || document.getElementById('customer-email').value;
    const letterContent = editor.innerHTML;
    const customerName = document.getElementById('customer-name').value || 'Valued Customer';
    const customerAddress = document.getElementById('customer-address').value;

    if (!customerEmail) {
      alert('Please enter a customer email address.');
      pendingSendEmailAddress = null;
      return;
    }

    if (!letterContent.trim()) {
      alert('Please write a letter before sending.');
      pendingSendEmailAddress = null;
      return;
    }

    if (!accessToken) {
      alert('Not authenticated. Please click "Send via Gmail" again.');
      return;
    }

    try {
      // Get the sheet HTML and create a complete email that looks like the printed page
      const sheet = document.querySelector('.sheet');
      
      let fullHTML = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            body {
              font-family: 'Syne', system-ui, -apple-system, sans-serif;
              background: white;
              color: #0b2a5b;
            }
            .sheet {
              max-width: 8.5in;
              margin: 0;
              padding: 0.75in;
              background: white;
            }
            .sheet-header {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              margin-bottom: 1.5rem;
              padding-bottom: 1.2rem;
              border-bottom: 2px solid #0e4f97;
              gap: 1.5rem;
            }
            .header-logo-link {
              display: inline-block;
              flex-shrink: 0;
            }
            .header-logo {
              width: 120px;
              height: auto;
              display: block;
            }
            .header-center {
              flex: 1;
              text-align: center;
              padding: 0 1rem;
            }
            .header-phone {
              width: 220px;
              height: auto;
              display: block;
            }
            .header-qr {
              text-align: center;
              flex-shrink: 0;
            }
            .header-qr-label {
              font-size: 0.8rem;
              font-weight: 600;
              color: #0b2a5b;
              margin-bottom: 0.3rem;
            }
            .header-qr-img {
              width: 90px;
              height: 90px;
            }
            .customer-fields {
              display: block;
              margin: 1.5rem 0;
              padding: 0;
            }
            .customer-fields label {
              display: block;
              margin-bottom: 1rem;
              font-weight: 600;
              font-size: 0.85rem;
              color: #0e4f97;
            }
            .customer-fields span {
              font-size: 0.8rem;
              font-weight: 600;
              color: #0e4f97;
              display: block;
              margin-bottom: 0.25rem;
            }
            .customer-fields input {
              display: none;
            }
            .customer-value {
              font-size: 0.95rem;
              color: #0b2a5b;
              font-weight: normal;
            }
            .editor-toolbar {
              display: none;
            }
            .letter-body {
              min-height: 3in;
              border: 1px solid #bdd2ee;
              border-radius: 4px;
              padding: 1rem;
              background: #fff;
              line-height: 1.6;
              margin: 1.5rem 0;
              white-space: pre-wrap;
              word-wrap: break-word;
              font-size: 0.95rem;
            }
            .letter-body h2 {
              font-size: 1rem;
              margin: 0.7rem 0 0.3rem;
              color: #0e4f97;
            }
            .letter-body h3 {
              font-size: 0.9rem;
              margin: 0.5rem 0 0.2rem;
              color: #385f92;
            }
            .letter-body p {
              margin: 0 0 0.5rem;
            }
            .letter-body ul, .letter-body ol {
              margin: 0.5rem 0 0.5rem 1.3rem;
            }
            .letter-body li {
              margin-bottom: 0.3rem;
            }
            .sheet-footer {
              margin-top: 1.5rem;
              padding-top: 1rem;
              border-top: 1px solid #bdd2ee;
              text-align: center;
            }
            .sheet-footer p {
              margin: 0.3rem 0;
              font-size: 0.7rem;
              color: #385f92;
              line-height: 1.4;
            }
          </style>
        </head>
        <body>
          <div class="sheet">
            <header class="sheet-header">
              <a class="header-logo-link">
                <img class="header-logo" src="https://sharper4.github.io/NTX-EPC_Letterhead/assets/LogoAlone.png" alt="North Texas Elite Pool Care logo">
              </a>
              <div class="header-center">
                <a class="header-logo-link">
                  <img class="header-phone" src="https://sharper4.github.io/NTX-EPC_Letterhead/assets/PhoneNumber.png" alt="940-808-POOL">
                </a>
              </div>
            </header>

            <section class="customer-fields">
              <label>
                <span>Customer Name:</span>
                <div class="customer-value">${customerName}</div>
              </label>
              <label>
                <span>Address:</span>
                <div class="customer-value">${customerAddress || '(Not provided)'}</div>
              </label>
              <label>
                <span>Email Address:</span>
                <div class="customer-value">${customerEmail}</div>
              </label>
            </section>

            <div class="letter-body">${letterContent}</div>

            <footer class="sheet-footer">
              <p>© 2026 North Texas Elite Pool Care LLC. All rights reserved.</p>
              <p>Serving Denton County and Surrounding Areas | Professional Pool Maintenance & Care</p>
            </footer>
          </div>
        </body>
        </html>
      `;

      // Create email message
      const emailSubject = 'Message from North Texas Elite Pool Care';
      const emailHeaders = `To: ${customerEmail}\r\nSubject: ${emailSubject}\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n`;
      const emailBody = emailHeaders + fullHTML;

      // Base64 encode the message (standard base64, not URL-safe)
      const encodedMessage = btoa(unescape(encodeURIComponent(emailBody)));

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
    } finally {
      pendingSendEmailAddress = null;
    }
  }

  /**
   * Send Email button click handler
   */
  sendEmailBtn.addEventListener('click', () => {
    sendEmailFlow();
  });

  // Initialize token client when page loads
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initBuildNumber();
      initializeTokenClient();
    });
  } else {
    initBuildNumber();
    initializeTokenClient();
  }
})();
