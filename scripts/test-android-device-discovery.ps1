$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'android-device-discovery.ps1')
function Assert-Equal($Actual,$Expected) { if($Actual -ne $Expected){throw "Expected $Expected; got $Actual"} }
$direct = { param([string[]]$Arguments) $command=$Arguments[0]; $arg=$Arguments[1]; if($command -eq 'devices'){ 'List of devices attached'; "192.168.1.5:44444`tdevice" } else { throw 'Unexpected discovery call for already-connected device' } }
Assert-Equal (Resolve-OneLeadQAndroidDevice $direct) '192.168.1.5:44444'
$script:connected=$false;$script:attempted=@()
$wireless={param([string[]]$Arguments) $command=$Arguments[0]; $arg=$Arguments[1];
 switch($command){
  devices { if($script:connected){"192.168.1.9:45555`tdevice"}else{'List of devices attached'} }
  mdns { 'phone _adb-tls-pairing._tcp 192.168.1.9:40000'; 'phone _adb-tls-connect._tcp. 192.168.1.9:45555' }
  connect {$script:attempted+= $arg;$script:connected=$true;'connected'}
 }
}
Assert-Equal (Resolve-OneLeadQAndroidDevice $wireless) '192.168.1.9:45555'
Assert-Equal ($script:attempted -join ',') '192.168.1.9:45555'
$empty={param([string[]]$Arguments) $command=$Arguments[0]; $arg=$Arguments[1]; if($command -eq 'devices'){"old:12345`toffline"}else{'List of discovered mdns services'}}
try {Resolve-OneLeadQAndroidDevice $empty;throw 'Should reject offline device'} catch {if($_.Exception.Message -notmatch 'No authorized Android'){throw}}
$multiple={param([string[]]$Arguments) $command=$Arguments[0]; $arg=$Arguments[1]; "one:12345`tdevice";"two:12345`tdevice"}
try {Resolve-OneLeadQAndroidDevice $multiple;throw 'Should reject ambiguous devices'} catch {if($_.Exception.Message -notmatch 'Multiple authorized'){throw}}
Assert-Equal (Resolve-OneLeadQAndroidDevice $multiple 'two:12345') 'two:12345'
try {Resolve-OneLeadQAndroidDevice $empty 'missing:12345';throw 'Should reject missing explicit device'} catch {if($_.Exception.Message -notmatch 'Requested Android'){throw}}
Write-Host 'PASS: connected-device selection, changed wireless port discovery, pairing-port exclusion, offline rejection, ambiguity and explicit serial handling'
