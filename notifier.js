import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Envía la respuesta al canal configurado:
 * - 'hud' (predeterminado): Overlay flotante Win32 No-Activate que NO roba foco ni sale de Fullscreen.
 * - 'telegram': Envía mensaje directo a un Bot de Telegram.
 * - 'both': Ambos canales simultáneamente.
 *
 * @param {string} title Título (ej: "Pregunta 1")
 * @param {string} message Respuesta sugerida
 */
export async function notifyAnswer(title, message) {
  const mode = (process.env.NOTIFICATION_CHANNEL || 'hud').toLowerCase();

  if (mode === 'hud' || mode === 'both') {
    showWindowsNotification(title, message);
  }

  if (mode === 'telegram' || mode === 'both') {
    await sendTelegramNotification(title, message);
  }
}

/**
 * Muestra un HUD pasivo Win32 con WS_EX_NOACTIVATE (0x08000000) y WS_EX_TRANSPARENT (0x00000020)
 * + ShowWithoutActivation = true.
 * Garantiza 0 pérdida de foco (sin evento blur) y 0 salida de modo pantalla completa (sin evento resize).
 */
export function showWindowsNotification(title, message) {
  const safeTitle = (title || 'Copiloto Quizzis').replace(/["'`$\r\n]/g, ' ');
  const safeMsg = (message || '').replace(/["'`$\r\n]/g, ' ');

  const psScript = `
Add-Type -TypeDefinition @"
using System;
using System.Drawing;
using System.Windows.Forms;
using System.Runtime.InteropServices;

public class PassiveHudForm : Form {
    [DllImport("user32.dll")]
    private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    private const int SW_SHOWNOACTIVATE = 4;
    private const int WS_EX_TOPMOST = 0x00000008;
    private const int WS_EX_NOACTIVATE = 0x08000000;
    private const int WS_EX_TOOLWINDOW = 0x00000080;
    private const int WS_EX_TRANSPARENT = 0x00000020;
    private const int WS_EX_LAYERED = 0x00080000;

    protected override bool ShowWithoutActivation {
        get { return true; }
    }

    protected override CreateParams CreateParams {
        get {
            CreateParams cp = base.CreateParams;
            cp.ExStyle |= WS_EX_TOPMOST | WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW | WS_EX_TRANSPARENT | WS_EX_LAYERED;
            return cp;
        }
    }

    public void ShowPassive() {
        ShowWindow(this.Handle, SW_SHOWNOACTIVATE);
    }
}
"@ -ReferencedAssemblies System.Windows.Forms, System.Drawing

$form = New-Object PassiveHudForm
$form.Size = New-Object System.Drawing.Size(400, 105)
$form.StartPosition = "Manual"
$screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$form.Location = New-Object System.Drawing.Point(($screen.Width - 415), ($screen.Height - 130))
$form.FormBorderStyle = "None"
$form.BackColor = [System.Drawing.Color]::FromArgb(20, 22, 30)
$form.TopMost = $true
$form.ShowInTaskbar = $false
$form.Opacity = 0.90

$lblTitle = New-Object System.Windows.Forms.Label
$lblTitle.Text = "🤖 ${safeTitle} (Modo Pasivo Sin Foco)"
$lblTitle.ForeColor = [System.Drawing.Color]::FromArgb(80, 230, 150)
$lblTitle.Font = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Bold)
$lblTitle.Location = New-Object System.Drawing.Point(12, 8)
$lblTitle.AutoSize = $true
$form.Controls.Add($lblTitle)

$lblMsg = New-Object System.Windows.Forms.Label
$lblMsg.Text = "${safeMsg}"
$lblMsg.ForeColor = [System.Drawing.Color]::White
$lblMsg.Font = New-Object System.Drawing.Font("Segoe UI", 11, [System.Drawing.FontStyle]::Bold)
$lblMsg.Location = New-Object System.Drawing.Point(12, 32)
$lblMsg.Size = New-Object System.Drawing.Size(376, 65)
$form.Controls.Add($lblMsg)

$form.ShowPassive()

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 6500
$timer.Add_Tick({
    $timer.Stop()
    $form.Close()
    [System.Windows.Forms.Application]::ExitThread()
})
$timer.Start()

[System.Windows.Forms.Application]::Run()
`;

  const encodedCommand = Buffer.from(psScript, 'utf16le').toString('base64');
  exec(`powershell -NoProfile -WindowStyle Hidden -EncodedCommand ${encodedCommand}`);
}

/**
 * Envía el resultado por Telegram si están configurados TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID
 */
export async function sendTelegramNotification(title, message) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: `🤖 *${title}*\n${message}`,
        parse_mode: 'Markdown',
      }),
    });
  } catch (err) {
    console.warn('Error enviando a Telegram:', err.message);
  }
}
