# Local-only interactive Windows credential prompt. Requires Windows PowerShell 5.1+ in the operator's desktop session.
# No credential values are accepted on argv, printed to stdout or written to Git.
param([ValidateSet('ionos','cloudflare')][string]$Provider='ionos')
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

$form=New-Object System.Windows.Forms.Form
$form.Text='QUMI '+$Provider.ToUpper()+' Bridge - Secure credential setup'
$form.Size=New-Object System.Drawing.Size(610,320)
$form.StartPosition='CenterScreen'
$form.FormBorderStyle='FixedDialog'
$form.MaximizeBox=$false
$form.MinimizeBox=$false
$form.TopMost=$true

function Make-Label([string]$text,[int]$y){
 $label=New-Object System.Windows.Forms.Label
 $label.Text=$text
 $label.Location=New-Object System.Drawing.Point(18,$y)
 $label.Size=New-Object System.Drawing.Size(560,20)
 $form.Controls.Add($label)
}
function Make-Input([int]$y,[bool]$masked){
 $input=New-Object System.Windows.Forms.TextBox
 $input.Location=New-Object System.Drawing.Point(18,$y)
 $input.Size=New-Object System.Drawing.Size(555,23)
 $input.UseSystemPasswordChar=$masked
 $form.Controls.Add($input)
 return $input
}
Make-Label 'Official '+$Provider+' HTTPS MCP endpoint (from your account portal):' 15
$endpointInput=Make-Input 40 $false
Make-Label 'Personal access token / MCP token (hidden, never sent to the agent):' 83
$tokenInput=Make-Input 108 $true
Make-Label 'Credentials are encrypted for this Windows user using DPAPI.' 153
Make-Label 'They are stored outside the Git checkout and never returned through MCP.' 174

$cancel=New-Object System.Windows.Forms.Button
$cancel.Text='Cancel';$cancel.Location=New-Object System.Drawing.Point(382,214);$cancel.Size=New-Object System.Drawing.Size(89,30)
$cancel.DialogResult=[System.Windows.Forms.DialogResult]::Cancel
$form.Controls.Add($cancel);$form.CancelButton=$cancel
$save=New-Object System.Windows.Forms.Button
$save.Text='Encrypt and save';$save.Location=New-Object System.Drawing.Point(474,214);$save.Size=New-Object System.Drawing.Size(100,30)
$form.Controls.Add($save)
$save.Add_Click({
 try {
  $url=$endpointInput.Text.Trim()
  $u=$null
  if(![Uri]::TryCreate($url,[UriKind]::Absolute,[ref]$u) -or $u.Scheme -ne 'https' -or $u.UserInfo -or $u.Fragment){throw 'Enter a valid HTTPS MCP endpoint without credentials or fragments.'}
  if($tokenInput.Text.Length -lt 8){throw 'A token of at least 8 characters is required.'}
  $dir=if($env:QUMI_IONOS_CONFIG_DIR){$env:QUMI_IONOS_CONFIG_DIR}else{Join-Path $env:USERPROFILE '.config\ionos-bridge'}
  if(-not [IO.Path]::IsPathRooted($dir)){throw 'Credential directory must be absolute.'}
  if(-not [IO.Directory]::Exists($dir)){[IO.Directory]::CreateDirectory($dir)|Out-Null}
  $identity=[System.Security.Principal.WindowsIdentity]::GetCurrent().User
  $acl=New-Object System.Security.AccessControl.DirectorySecurity
  $acl.SetAccessRuleProtection($true,$false)
  $rule=New-Object System.Security.AccessControl.FileSystemAccessRule($identity,'FullControl','ContainerInherit,ObjectInherit','None','Allow')
  $acl.AddAccessRule($rule)
  [IO.Directory]::SetAccessControl($dir,$acl)
  $target=Join-Path $dir ($Provider+'.dpapi')
  if([IO.File]::Exists($target)){
   $decision=[System.Windows.Forms.MessageBox]::Show('This replaces an existing credential. Revoke any exposed or obsolete token at the provider. Continue?','Replace encrypted credential',[System.Windows.Forms.MessageBoxButtons]::YesNo,[System.Windows.Forms.MessageBoxIcon]::Warning)
   if($decision -ne [System.Windows.Forms.DialogResult]::Yes){return}
  }
  $json=ConvertTo-Json -Compress -InputObject @{endpoint=$url;token=$tokenInput.Text}
  $plain=[System.Text.Encoding]::UTF8.GetBytes($json)
  try {
   $encrypted=[System.Security.Cryptography.ProtectedData]::Protect($plain,[System.Text.Encoding]::UTF8.GetBytes('ionos-bridge/'+$Provider),[System.Security.Cryptography.DataProtectionScope]::CurrentUser)
  } finally {[Array]::Clear($plain,0,$plain.Length)}
  $temp=Join-Path $dir ([Guid]::NewGuid().ToString('N')+'.tmp')
  [IO.File]::WriteAllBytes($temp,$encrypted)
  $fileAcl=New-Object System.Security.AccessControl.FileSecurity
  $fileAcl.SetAccessRuleProtection($true,$false)
  $fileAcl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($identity,'FullControl','Allow')))
  [IO.File]::SetAccessControl($temp,$fileAcl)
  if([IO.File]::Exists($target)){[IO.File]::Delete($target)}
  [IO.File]::Move($temp,$target)
  $tokenInput.Clear()
  [System.Windows.Forms.MessageBox]::Show('Encrypted credential saved for this Windows user. Restart the MCP bridge and run ionos_discover_tools. No token was sent through chat.','QUMI Bridge',[System.Windows.Forms.MessageBoxButtons]::OK,[System.Windows.Forms.MessageBoxIcon]::Information)|Out-Null
  $form.DialogResult=[System.Windows.Forms.DialogResult]::OK
  $form.Close()
 } catch {
  [System.Windows.Forms.MessageBox]::Show($_.Exception.Message,'QUMI Bridge setup error',[System.Windows.Forms.MessageBoxButtons]::OK,[System.Windows.Forms.MessageBoxIcon]::Error)|Out-Null
 }
})
[void]$form.ShowDialog()
$form.Dispose()
