param(
 [string]$Adb = 'D:\Android\platform-tools\adb.exe',
 [string]$Device,
 [string]$OutputDirectory = (Join-Path $PSScriptRoot '../reports/android'),
 [switch]$LiveAI
)
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$results = [Collections.Generic.List[object]]::new()
function Record($Name,$Status,$Actual) { $results.Add([pscustomobject]@{name=$Name;status=$Status;actual=$Actual}); Write-Host "$Status`: $Name - $Actual" }
function AdbCall([string[]]$Arguments) {
 $value = & $Adb -s $Device @Arguments 2>&1
 if($LASTEXITCODE -ne 0){throw 'ADB operation failed; inspect device connectivity'}
 return $value
}
function Screen {
 AdbCall @('shell','uiautomator','dump','/sdcard/oneleadq-qa.xml') | Out-Null
 [xml]((AdbCall @('shell','cat','/sdcard/oneleadq-qa.xml')) -join "`n")
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
 AdbCall @('shell','input','tap',"$x","$y") | Out-Null
 Start-Sleep -Milliseconds 900
}
function Evidence($Name) {
 # Hierarchies/screenshots can contain client information: local only, never commit them.
 (Screen).Save((Join-Path $OutputDirectory "$Name.xml"))
 AdbCall @('shell','screencap','-p',"/sdcard/oneleadq-$Name.png") | Out-Null
 AdbCall @('pull',"/sdcard/oneleadq-$Name.png",(Join-Path $OutputDirectory "$Name.png")) | Out-Null
}
function Check($Name,$Pattern) {
 if(Find $Pattern){Record $Name PASS 'Expected accessible element visible'}else{Record $Name FAIL "Missing selector: $Pattern"}
}
try {
 if(!(Test-Path -LiteralPath $Adb)){throw 'ADB executable unavailable'}
 $devices=@(& $Adb devices | Select-String '^([^\s]+)\s+device\s*$' | ForEach-Object {$_.Matches[0].Groups[1].Value})
 if(!$Device){
  if($devices -contains '192.168.1.4:38819'){$Device='192.168.1.4:38819'}
  elseif($devices.Count -eq 1){$Device=$devices[0]}
  elseif($devices.Count -eq 0){throw 'No authorized Android device connected'}
  else{throw 'Multiple devices detected; specify -Device to avoid testing the wrong phone'}
 }
 AdbCall @('shell','monkey','-p','com.oneleadq.app','-c','android.intent.category.LAUNCHER','1') | Out-Null
 Start-Sleep -Seconds 2
 Check 'Application launch' 'OneLeadQ|Home|Clients'
 Tap '(?i)(^Home$|, Home$)'; Check 'Home Dashboard' 'Agency Command Center'; Evidence home
 Tap '(?i)(^Clients$|, Clients$)'; Check 'Clients navigation' 'OneLeadQ client workspaces'; Check 'Client list' 'Stage 16'; Check 'Stage 16 fixture visibility' '(?i)Stage 16 test client'; Evidence clients
 # Selecting a client persists user state, so do not silently change their current client.
 Record 'Client workspace navigation' BLOCKED 'Requires explicit fixture selection; no client records modified'
 Tap '(?i)(^AI$|, AI$)'; Check 'AI Assistant navigation' 'Ask OneLeadQ AI|AI Assistant'; Check 'AI health label' 'AI Agent (Online|Offline)|CHECK CONNECTION'; Evidence ai
 $xml=Screen; $input=@($xml.SelectNodes('//node') | Where-Object {$_.class -eq 'android.widget.EditText'})
 if($input.Count){Record 'AI input' PASS 'Accessible editable input found'}else{Record 'AI input' BLOCKED 'Input not in current viewport; scroll and retest'}
 Check 'Floating Assistant accessibility' '^Open OneLeadQ assistant$'
 if($LiveAI){Record 'Live AI submission' BLOCKED 'Use the configured fixture workflow; this runner deliberately does not submit arbitrary live requests'}else{Record 'AI submission and response' BLOCKED 'Live provider call omitted; mocked regression tests cover request handling'}
 Record 'Assistant overlap' BLOCKED 'Screenshots captured; geometry acceptance requires response and bottom-of-scroll retest'
 Record 'Website workflow' BLOCKED 'Requires Stage 16 fixture workspace/session; never approve, publish or deploy automatically'
 # Capture crash signatures only; do not export arbitrary application logs or prompts.
 $crashes=AdbCall @('logcat','-d','-t','500','AndroidRuntime:E','*:S')
 $count=@($crashes | Select-String 'FATAL EXCEPTION').Count
 Record 'Recent Android crash scan' $(if($count){'FAIL'}else{'PASS'}) "$count fatal exception signatures in bounded system log (not app-specific)"
} catch { Record 'Android workflow' BLOCKED $_.Exception.Message }
finally {
 $results | ConvertTo-Json -Depth 4 | Set-Content -Encoding UTF8 (Join-Path $OutputDirectory 'results.json')
}
if(@($results | Where-Object status -eq 'FAIL').Count){exit 1}
if(@($results | Where-Object status -eq 'BLOCKED').Count){exit 2}
