param(
  [Parameter(Mandatory = $true)][string]$Title,
  [Parameter(Mandatory = $true)][string]$Message
)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$tray = New-Object System.Windows.Forms.NotifyIcon
$tray.Icon = [System.Drawing.SystemIcons]::Information
$tray.Visible = $true
$tray.BalloonTipTitle = $Title
$tray.BalloonTipText = $Message
$tray.BalloonTipIcon = [System.Windows.Forms.ToolTipIcon]::Info
$tray.ShowBalloonTip(10000)
Start-Sleep -Seconds 12
$tray.Visible = $false
$tray.Dispose()
