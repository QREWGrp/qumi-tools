param([Parameter(Mandatory=$true)][string]$VaultDirectory)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Security
[System.Windows.Forms.Application]::EnableVisualStyles()
$form = New-Object System.Windows.Forms.Form
$form.Text='DEPOT Bridge — Windows DPAPI credential setup'
$form.Size=New-Object System.Drawing.Size(650,335)
$form.StartPosition='CenterScreen'
$form.FormBorderStyle='FixedDialog'
$form.MaximizeBox=$false
$fields=@{}
$names=@('DEPOT_TOKEN','DEPOT_API_KEY','DEPOT_GIT_KEY')
for($i=0;$i -lt $names.Count;$i++) {
  $name=$names[$i]
  $label=New-Object System.Windows.Forms.Label
  $label.Text=$name
  $label.Location=New-Object System.Drawing.Point(16,(25+65*$i))
  $label.Size=New-Object System.Drawing.Size(145,24)
  $form.Controls.Add($label)
  $field=New-Object System.Windows.Forms.TextBox
  $field.Name=$name
  $field.Location=New-Object System.Drawing.Point(165,(20+65*$i))
  $field.Size=New-Object System.Drawing.Size(450,27)
  $field.UseSystemPasswordChar=$true
  $form.Controls.Add($field)
  $fields[$name]=$field
}
$note=New-Object System.Windows.Forms.Label
$note.Text='Blank fields are unchanged. Stored locally as Windows DPAPI CurrentUser ciphertext; not sent to ChatGPT.'
$note.Location=New-Object System.Drawing.Point(16,225)
$note.Size=New-Object System.Drawing.Size(600,32)
$form.Controls.Add($note)
$save=New-Object System.Windows.Forms.Button
$save.Text='Encrypt and save'
$save.Location=New-Object System.Drawing.Point(400,260)
$save.Size=New-Object System.Drawing.Size(120,26)
$form.Controls.Add($save)
$cancel=New-Object System.Windows.Forms.Button
$cancel.Text='Cancel'
$cancel.Location=New-Object System.Drawing.Point(532,260)
$cancel.Size=New-Object System.Drawing.Size(85,26)
$cancel.Add_Click({ $form.Close() })
$form.Controls.Add($cancel)
$save.Add_Click({
  try {
    if(-not [IO.Path]::IsPathRooted($VaultDirectory)){throw 'Vault path must be absolute'}
    [IO.Directory]::CreateDirectory($VaultDirectory)|Out-Null
    # Restrict ACL to this identity and SYSTEM; avoid inherited broad access.
    $identity=[Security.Principal.WindowsIdentity]::GetCurrent().User
    $acl=New-Object Security.AccessControl.DirectorySecurity
    $acl.SetAccessRuleProtection($true,$false)
    $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($identity,'FullControl','ContainerInherit,ObjectInherit','None','Allow')))
    $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule('NT AUTHORITY\SYSTEM','FullControl','ContainerInherit,ObjectInherit','None','Allow')))
    [IO.Directory]::SetAccessControl($VaultDirectory,$acl)
    foreach($name in $names){
      $value=$fields[$name].Text
      if([string]::IsNullOrEmpty($value)){continue}
      $bytes=[Text.Encoding]::UTF8.GetBytes($value)
      try {
        $cipher=[Security.Cryptography.ProtectedData]::Protect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
        $target=Join-Path $VaultDirectory ($name+'.dpapi')
        [IO.File]::WriteAllBytes($target,$cipher)
        # Harden existing files too, even when replacing an old credential.
        $facl=New-Object Security.AccessControl.FileSecurity
        $facl.SetAccessRuleProtection($true,$false)
        $facl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($identity,'FullControl','Allow')))
        $facl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule('NT AUTHORITY\SYSTEM','FullControl','Allow')))
        [IO.File]::SetAccessControl($target,$facl)
      }finally { [Array]::Clear($bytes,0,$bytes.Length); $fields[$name].Clear() }
    }
    [Windows.Forms.MessageBox]::Show('Encrypted credential files saved. Restart bridge under this SAME Windows identity.','DEPOT Bridge')|Out-Null
    $form.Close()
  }catch{[Windows.Forms.MessageBox]::Show('Setup failed: '+$_.Exception.Message,'DEPOT Bridge')|Out-Null}
})
[void]$form.ShowDialog()
$form.Dispose()
