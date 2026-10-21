param([ValidateSet('Read','Write','InitializeTLS')][string]$Action,[Parameter(Mandatory=$true)][string]$Path)
$ErrorActionPreference='Stop'
trap { [Console]::Error.WriteLine('DPAPI helper failed: '+$_.Exception.GetType().FullName+'; HResult='+$_.Exception.HResult); exit 1 }
Add-Type -AssemblyName System.Security
$target=[IO.Path]::GetFullPath($Path)
function Protect-Text([string]$Text){[Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes($Text),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)}
function Write-Vault([string]$Text){[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target))|Out-Null;$temporary=$target+'.tmp';[IO.File]::WriteAllBytes($temporary,(Protect-Text $Text));Move-Item -LiteralPath $temporary -Destination $target -Force}
if($Action -eq 'Read'){
    if(!(Test-Path -LiteralPath $target)){[Console]::Out.Write('null');exit}
    $plain=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($target),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
    # Used only through a private Node child-process pipe, never a terminal/log command.
    $text=[Text.Encoding]::UTF8.GetString($plain)
    $record=$text|ConvertFrom-Json
    if($record -and $record.pfx -and !$record.certificate){
        $certificate=New-Object Security.Cryptography.X509Certificates.X509Certificate2
        $certificate.Import([Convert]::FromBase64String($record.pfx),[string]$record.password,[Security.Cryptography.X509Certificates.X509KeyStorageFlags]::EphemeralKeySet)
        $record|Add-Member -NotePropertyName certificate -NotePropertyValue ([Convert]::ToBase64String($certificate.RawData))
        $text=$record|ConvertTo-Json -Compress -Depth 8
    }
    [Console]::Out.Write($text);exit
}
if($Action -eq 'Write'){Write-Vault ([Console]::In.ReadToEnd());exit}
if(Test-Path -LiteralPath $target){throw 'TLS identity already exists. Refusing silent certificate/gateway identity rotation.'}
$certificate=New-SelfSignedCertificate -DnsName 'oneleadq.local' -Subject 'CN=OneLeadQ Trusted Gateway TLS' -CertStoreLocation 'Cert:\CurrentUser\My' -KeyAlgorithm RSA -KeyLength 3072 -HashAlgorithm SHA256 -KeyExportPolicy Exportable -NotAfter (Get-Date).AddYears(2) -Type SSLServerAuthentication
$random=New-Object byte[] 32;[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($random);$password=[Convert]::ToBase64String($random)
$pfx=$certificate.Export([Security.Cryptography.X509Certificates.X509ContentType]::Pfx,$password)
$sha=[Security.Cryptography.SHA256]::Create();$fingerprint=([BitConverter]::ToString($sha.ComputeHash($certificate.RawData))).Replace('-','').ToLowerInvariant()
$identity=@{gatewayId=[guid]::NewGuid().ToString();pfx=[Convert]::ToBase64String($pfx);password=$password;fingerprint=$fingerprint;certificate=[Convert]::ToBase64String($certificate.RawData)}
Write-Vault ($identity|ConvertTo-Json -Compress)
Write-Output 'TLS identity created and DPAPI-protected for this Windows user. No root certificate trust was installed; no Authenticode signing or App Control change.'
