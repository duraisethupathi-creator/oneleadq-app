function Read-OneLeadQScreenXml {
 param([scriptblock]$RunAdb)
 $remote='/sdcard/oneleadq-qa.xml'
 # This is this runner's cache artifact, never application/client data.
 & $RunAdb -Arguments @('shell','rm','-f',$remote) | Out-Null
 $dump=@(& $RunAdb -Arguments @('shell','uiautomator','dump',$remote))
 if(($dump -join "`n") -match '(?i)ERROR:|could not get idle'){throw 'UIAutomator could not capture a fresh hierarchy. Animation/idle wait blocked inspection; stale XML was not reused.'}
 $raw=(& $RunAdb -Arguments @('shell','cat',$remote)) -join "`n"
 try{[xml]$xml=$raw}catch{throw 'Fresh UI hierarchy is not valid XML'}
 if(!$xml.hierarchy){throw 'Fresh UI hierarchy is missing its root'}
 return $xml
}
