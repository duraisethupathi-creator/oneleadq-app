param(
 [string]$Adb = 'D:\Android\platform-tools\adb.exe',
 [string]$Device,
 [string]$OutputDirectory = (Join-Path $PSScriptRoot '../reports/android'),
 [switch]$PauseRoaming,
 [switch]$AIOnly,
 [switch]$Stage16Fixture,
 [string]$FixtureClientId = 'client-1791856192040',
 [Alias('LiveAI')][switch]$WebsiteRoutingProbe
)
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$results = [Collections.Generic.List[object]]::new()
function Record($Name,$Status,$Actual) { $results.Add([pscustomobject]@{name=$Name;status=$Status;actual=$Actual}); Write-Host "$Status`: $Name - $Actual" }
function AdbCall([string[]]$Arguments) {
 # Native tools may write diagnostics to stderr on success (for example monkey).
 $ErrorActionPreference = "Continue"
 $value = & $Adb -s $Device @Arguments 2>&1
 if($LASTEXITCODE -ne 0){throw 'ADB operation failed; inspect device connectivity'}
 return $value
}
function Screen {
 . (Join-Path $PSScriptRoot 'android-screen.ps1')
 $runScreenAdb = { param([string[]]$Arguments) AdbCall -Arguments $Arguments }
 Read-OneLeadQScreenXml -RunAdb $runScreenAdb
}
function Find($Pattern) {
 $xml=Screen
 @($xml.SelectNodes('//node') | Where-Object { $_.text -match $Pattern -or $_.'content-desc' -match $Pattern }) | Select-Object -First 1
}
function Tap($Pattern) {
 $node=Find $Pattern
 if(!$node){throw "Selector unavailable: $Pattern"}
 if($node.bounds -notmatch '^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$'){throw 'Invalid UI bounds'}
 $x=[int](([int]$Matches[1]+[int]$Matches[3])/2); $y=[int](([int]$Matches[2]+[int]$Matches[4])/2)
 AdbCall -Arguments @('shell','input','tap',"$x","$y") | Out-Null
 Start-Sleep -Milliseconds 900
}
function Scroll-Screen($Direction) {
 $xml=Screen
 $node=$xml.SelectNodes('//node') | Where-Object { $_.scrollable -eq 'true' } | Select-Object -First 1
 if(!$node -or $node.bounds -notmatch '^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$'){return}
 $x=[int](([int]$Matches[1]+[int]$Matches[3])/2);$span=[int]$Matches[4]-[int]$Matches[2];$top=[int]([int]$Matches[2]+$span*0.25);$bottom=[int]([int]$Matches[2]+$span*0.75)
 if($Direction -eq 'up'){$from=$top;$to=$bottom}else{$from=$bottom;$to=$top}
 AdbCall -Arguments @('shell','input','swipe',"$x","$from","$x","$to",'500') | Out-Null
}
function Bounds($Node) {
 if($Node.bounds -match '^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$'){return @([int]$Matches[1],[int]$Matches[2],[int]$Matches[3],[int]$Matches[4])}
 throw 'Invalid node bounds'
}
function Evidence($Name) {
 # Hierarchies/screenshots can contain client information: local only, never commit them.
 (Screen).Save((Join-Path $OutputDirectory "$Name.xml"))
 AdbCall -Arguments @('shell','screencap','-p',"/sdcard/oneleadq-$Name.png") | Out-Null
 AdbCall -Arguments @('pull',"/sdcard/oneleadq-$Name.png",(Join-Path $OutputDirectory "$Name.png")) | Out-Null
}
function Check($Name,$Pattern) {
 if(Find $Pattern){Record $Name PASS 'Expected accessible element visible'}else{Record $Name FAIL "Missing selector: $Pattern"}
}
try {
 if(!(Test-Path -LiteralPath $Adb)){throw 'ADB executable unavailable'}
 if($WebsiteRoutingProbe -and !$Stage16Fixture){throw 'WebsiteRoutingProbe requires explicit -Stage16Fixture; no submission attempted'}
 . (Join-Path $PSScriptRoot 'android-device-discovery.ps1')
 $runAdb = { param([string[]]$Arguments) & $Adb @Arguments }
 $Device = Resolve-OneLeadQAndroidDevice -RunAdb $runAdb -RequestedDevice $Device
 if($PauseRoaming){AdbCall -Arguments @('shell','am','start','-a','android.intent.action.VIEW','-d','oneleadq:///?qaPauseAssistant=1','com.oneleadq.app') | Out-Null;Start-Sleep -Seconds 1}
 AdbCall -Arguments @('shell','monkey','-p','com.oneleadq.app','-c','android.intent.category.LAUNCHER','1') | Out-Null
 Start-Sleep -Seconds 2
 Check 'Application launch' 'OneLeadQ|Home|Clients'
 if(!$AIOnly){
 Tap '(?i)(^Home$|, Home$)'; Check 'Home Dashboard' 'Agency Command Center'; Evidence home
 Tap '(?i)(^Clients$|, Clients$)'; Check 'Clients navigation' 'OneLeadQ client workspaces'; Check 'Client list' 'Stage 16'; Check 'Stage 16 fixture visibility' '(?i)Stage 16 test client'; Evidence clients
 if($Stage16Fixture){
  Tap '^Stage 16 test client$'; if(Find '^SET AS CURRENT CLIENT$'){Tap '^SET AS CURRENT CLIENT$'}; Check 'Client workspace navigation' '^Client workspace$'; Check 'Fixture workspace identity' '^Stage 16 test client$'; Evidence fixture
  AdbCall -Arguments @('shell','input','keyevent','4') | Out-Null
 }else{Record 'Client workspace navigation' BLOCKED 'Use -Stage16Fixture to explicitly select the synthetic test client'}

 }
 Tap '(?i)(^AI$|, AI$)'
 for($i=0;$i -lt 5 -and !(Find '^CHECK$');$i++){Scroll-Screen up}
 Check 'AI Assistant navigation' 'Ask OneLeadQ AI|AI Assistant'
 if(Find '^CHECK$'){Tap '^CHECK$';Start-Sleep -Seconds 1}
 Check 'AI health label' 'AI Agent (Online|Offline)'
 Check 'Phone to AI backend connectivity' 'AI Agent Online'
 if($WebsiteRoutingProbe -and !(Find '^Stage 16 test client$')){throw 'The selected AI client is not the Stage 16 fixture; no submission attempted'}
 for($i=0;$i -lt 3 -and !(Find '^GENERATE');$i++){Scroll-Screen down}
 Check 'Tamil Generate button' 'GENERATE / உருவாக்கு'; Evidence ai

 $xml=Screen; $input=@($xml.SelectNodes('//node') | Where-Object {$_.class -eq 'android.widget.EditText'})
 if($input.Count){Record 'AI input' PASS 'Accessible editable input found'}else{Record 'AI input' BLOCKED 'Input not in current viewport; scroll and retest'}
 Check 'Floating Assistant accessibility' '^Open OneLeadQ assistant$'
 if($WebsiteRoutingProbe){
  Tap '^AI prompt$';$focused=(Screen).SelectNodes('//node') | Where-Object { $_.'content-desc' -eq 'AI prompt' -and $_.focused -eq 'true' } | Select-Object -First 1
  if(!$focused){throw 'AI prompt did not gain focus; submission not attempted'}
  AdbCall -Arguments @('shell','input','keyevent','123') | Out-Null
  $deleteCount=[Math]::Min(512,([string]$focused.text).Length+2)
  AdbCall -Arguments (@('shell','input','keyevent')+(@('67')*$deleteCount)) | Out-Null
  AdbCall -Arguments @('shell','input','text','Create%sa%swebsite') | Out-Null
  AdbCall -Arguments @('shell','input','keyevent','4') | Out-Null;Start-Sleep -Milliseconds 800
  $typed=Find '^AI prompt$';if(!$typed -or $typed.text -ne 'Create a website'){throw 'Fixture prompt could not be verified exactly; submission not attempted'}
  Tap '^GENERATE';Record 'AI prompt submission' PASS 'Submitted only the validated fixture website-routing command; no provider inference requested'
  for($i=0;$i -lt 4 -and !(Find '^Web Development Agent$');$i++){Scroll-Screen down;Start-Sleep -Milliseconds 500}
  Check 'AI response rendering' '^Web Development Agent$'
  for($i=0;$i -lt 4 -and !(Find '^Open Website Development workspace$');$i++){Scroll-Screen down}
  Check 'Website workspace handoff entry' '^Open Website Development workspace$';Evidence ai-routing
  Tap '^Open Website Development workspace$';Check 'Website handoff client ID' ([regex]::Escape($FixtureClientId));Evidence website-handoff
  Tap '^Close Website Development workspace$'
 }else{Record 'AI submission and response' BLOCKED 'Not exercised by navigation-only mode; use -WebsiteRoutingProbe -Stage16Fixture for the safe no-inference website route'}
 $xml=Screen;$nodes=@($xml.SelectNodes('//node'));$assistant=$nodes | Where-Object { $_.'content-desc' -eq 'Open OneLeadQ assistant' } | Select-Object -First 1
 $controls=@($nodes | Where-Object { $_.clickable -eq 'true' -and ($_.'content-desc' -match 'GENERATE|, (Home|Clients|AI|Tasks|More)$') })
 if($assistant -and $controls.Count){
  $a=Bounds $assistant;$overlaps=@($controls | Where-Object {$b=Bounds $_; $a[0] -lt $b[2] -and $a[2] -gt $b[0] -and $a[1] -lt $b[3] -and $a[3] -gt $b[1]})
  Record 'Assistant launcher overlap with visible controls' $(if($overlaps.Count){'FAIL'}else{'PASS'}) "$($overlaps.Count) intersections among $($controls.Count) visible Generate/navigation touch targets; response/keyboard checked separately"
 }else{Record 'Assistant overlap with visible controls' BLOCKED 'Assistant or controls not accessible'}

 Record 'Live final website generation' BLOCKED 'BLOCKED BY HUMAN APPROVAL. Preapproval generation/selection is covered separately; this runner never approves or publishes'
 # Capture crash signatures only; do not export arbitrary application logs or prompts.
 $crashes=AdbCall -Arguments @('logcat','-d','-t','500','AndroidRuntime:E','*:S')
 $count=@($crashes | Select-String 'FATAL EXCEPTION').Count
 Record 'Recent Android crash scan' $(if($count){'FAIL'}else{'PASS'}) "$count fatal exception signatures in bounded system log (not app-specific)"
} catch { Record 'Android workflow' BLOCKED $_.Exception.Message }
finally {
 if($PauseRoaming -and $Device){try{AdbCall -Arguments @('shell','am','start','-a','android.intent.action.VIEW','-d','oneleadq:///?qaPauseAssistant=0','com.oneleadq.app') | Out-Null}catch{Record 'Restore assistant motion' BLOCKED 'Unable to clear development-only motion pause'}}
 $results | ConvertTo-Json -Depth 4 | Set-Content -Encoding UTF8 (Join-Path $OutputDirectory 'results.json')
}
if(@($results | Where-Object status -eq 'FAIL').Count){exit 1}
if(@($results | Where-Object status -eq 'BLOCKED').Count){exit 2}
