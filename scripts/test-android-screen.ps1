$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'android-screen.ps1')
$script:commands=@();$script:readCalls=0
$valid={param([string[]]$Arguments) $script:commands+=($Arguments -join ' ');if($Arguments[1] -eq 'cat'){'<hierarchy><node text="Fixture" /></hierarchy>'}else{'UI hierchary dumped to cache'}}
$x=Read-OneLeadQScreenXml $valid
if($x.hierarchy.node.text -ne 'Fixture'){throw 'Fresh XML not returned'}
if($script:commands[0] -ne 'shell rm -f /sdcard/oneleadq-qa.xml'){throw 'Stale cache not removed first'}
Write-Host 'PASS: cache removal precedes fresh hierarchy capture'
$idle={param([string[]]$Arguments) if($Arguments[1] -eq 'uiautomator'){'ERROR: could not get idle state.'};if($Arguments[1] -eq 'cat'){$script:readCalls++;'<hierarchy><node text="Stale" /></hierarchy>'}}
try{Read-OneLeadQScreenXml $idle;throw 'Idle error should block'}catch{if($_.Exception.Message -notmatch 'stale XML was not reused'){throw}}
if($script:readCalls){throw 'Stale XML read after failed dump'}
Write-Host 'PASS: exit-zero idle error blocks without reading stale XML'
$bad={param([string[]]$Arguments) if($Arguments[1] -eq 'cat'){'not XML'}}
try{Read-OneLeadQScreenXml $bad;throw 'Invalid XML should block'}catch{if($_.Exception.Message -notmatch 'not valid XML'){throw}}
Write-Host 'PASS: malformed fresh XML blocks inspection'
