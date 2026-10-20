'use strict';
// Artifact-only build. Never installs, starts an emulator, publishes or changes the source app config.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),stage=path.join(root,'artifacts/batch3/android-development-build');
const prepareOnly=process.argv.includes('--prepare-only');
function run(command,args,cwd=root){const r=cp.spawnSync(command,args,{cwd,stdio:'inherit',env:{...process.env,CI:'1',CMAKE_BUILD_PARALLEL_LEVEL:'1'}});if(r.error)throw r.error;if(r.status!==0)throw Error('Build step failed with exit '+r.status);}
function main(){
 if(!prepareOnly){
  const java=process.env.JAVA_HOME?path.join(process.env.JAVA_HOME,'bin',process.platform==='win32'?'java.exe':'java'):'java';
  const check=cp.spawnSync(java,['-version'],{encoding:'utf8'});if(check.error||check.status!==0)throw Error('BLOCKED: JDK unavailable. Configure an authorized JDK 17+ compatible with generated Gradle before building.');
  const sdk=process.env.ANDROID_HOME||process.env.ANDROID_SDK_ROOT;
  if(!sdk||!fs.existsSync(path.join(sdk,'platforms','android-36'))||!fs.existsSync(path.join(sdk,'build-tools','36.0.0')))throw Error('BLOCKED: Android SDK platform 36/build-tools 36.0.0 unavailable at configured SDK path.');
 }
 fs.mkdirSync(stage,{recursive:true});
 for(const name of ['app.json','package.json','package-lock.json','tsconfig.json','app','src','modules','assets','asset','plugins']){const source=path.join(root,name);if(fs.existsSync(source))fs.cpSync(source,path.join(stage,name),{recursive:true});}
 const dependencies=path.join(stage,'node_modules');if(!fs.existsSync(dependencies))fs.symlinkSync(path.join(root,'node_modules'),dependencies,process.platform==='win32'?'junction':'dir');
 run(process.execPath,[path.join(root,'node_modules/expo/bin/cli'),'prebuild',stage,'--platform','android','--no-install','--template',path.join(root,'node_modules/expo/template.tgz')]);
 // Limit only this generated build, not user-wide Gradle or application source settings.
 const properties=path.join(stage,'android','gradle.properties');
 let settings=fs.readFileSync(properties,'utf8').replace(/^org.gradle.parallel=.*$/m,'org.gradle.parallel=false');
 for(const key of ['org.gradle.workers.max','kotlin.compiler.execution.strategy'])settings=settings.split('\n').filter(line=>!line.startsWith(key+'=')).join('\n');
 fs.writeFileSync(properties,settings+'\norg.gradle.workers.max=1\nkotlin.compiler.execution.strategy=in-process\n');
 if(prepareOnly){console.log('PREBUILD PASS only; native compilation and APK signing remain unverified. '+stage);return;}
 const android=path.join(stage,'android');
 // Pin the app's CMake selection to the inspected RN default when provided by CI.
 if(process.env.CMAKE_VERSION){
  if(!/^\d+\.\d+\.\d+$/.test(process.env.CMAKE_VERSION))throw Error('Invalid CMake version');
  fs.appendFileSync(path.join(android,'app','build.gradle'),'\nandroid { externalNativeBuild { cmake { version "'+process.env.CMAKE_VERSION+'" } } }\n');
 }
 if(process.platform==='win32'){
  // Fixed, trusted batch path; no user-built shell text or filesystem mutation through cmd.
  run(process.env.ComSpec||'cmd.exe',['/d','/c','gradlew.bat','app:assembleDebug','--no-daemon','-PreactNativeArchitectures=arm64-v8a'],android);
 }else {fs.chmodSync(path.join(android,'gradlew'),0o755);run('./gradlew',['app:assembleDebug','--no-daemon','-PreactNativeArchitectures=arm64-v8a'],android);}
 const apk=path.join(android,'app/build/outputs/apk/debug/app-debug.apk');if(!fs.existsSync(apk))throw Error('Expected debug APK missing; refuse build PASS');
 const result={apk,sha256:crypto.createHash('sha256').update(fs.readFileSync(apk)).digest('hex'),nativeBuild:'PASS',installation:'NOT ATTEMPTED',signerMatch:'NOT VERIFIED',checkedAt:new Date().toISOString()};
 fs.writeFileSync(path.join(stage,'build-result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}
try{main();}catch(error){console.error(error.message);process.exitCode=1;}
