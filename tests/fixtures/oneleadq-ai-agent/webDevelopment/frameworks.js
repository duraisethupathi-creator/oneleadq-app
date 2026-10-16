const ADAPTERS=Object.freeze({
 STATIC_HTML:{implemented:true,create:'approvedStaticPlan',inspect:'bounded HTML/CSS/JS source',validation:['npm-typecheck','npm-build'],build:'npm-build',preview:'static HTTP preview',safeEditableLocations:['*.html','*.css','*.js','package.json','robots.txt','sitemap.xml']},
 REACT:{implemented:false,create:null,inspect:'existing React source',validation:['npm-typecheck','npm-test','npm-lint','npm-build'],build:'existing npm-build only',preview:'existing project command; not automatically launched',safeEditableLocations:['src/','app/','components/']},
 VITE:{implemented:false,create:null,inspect:'existing Vite source',validation:['npm-typecheck','npm-test','npm-lint','npm-build'],build:'existing npm-build only',preview:'existing project command; not automatically launched',safeEditableLocations:['src/','index.html','public/']},
 NEXT_JS:{implemented:false,create:null,inspect:'existing Next source',validation:['npm-typecheck','npm-test','npm-lint','npm-build'],build:'existing npm-build only',preview:'existing project command; not automatically launched',safeEditableLocations:['src/','app/','pages/','components/','public/']},
});
module.exports={ADAPTERS};
