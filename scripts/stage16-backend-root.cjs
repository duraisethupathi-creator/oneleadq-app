const path=require('node:path');
module.exports=process.env.ONELEADQ_BACKEND_ROOT||path.resolve(__dirname,'../tests/fixtures/oneleadq-ai-agent');
