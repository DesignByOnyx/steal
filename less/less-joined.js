(function() {
	var lessText = '',
		lessFiles = [],
		$inlineStyles,
		importRegex = /@import(?:-(?:once|multiple))?\s+(?:["']|url\()(.+)(?:["']|\));?/i; // DO NOT USE THE /g MODIFIER!!!;
		
	function updateStyles( options ) {
		lessFiles.push( options );
		lessText += '\n' + options.text;
		
		// TODO: Replace with real javascript
		if(!$inlineStyles || !$inlineStyles.length) {
			$inlineStyles = can.$('<style id="less:application-styles" />').appendTo('head');
		}
		
		// Always reset the the "type", as the LESS engine requires "text/less"
		$inlineStyles.attr('type', 'text/less').text( lessText );
		less.refreshStyles();
		
		if( steal.isRhino ) {
			new (less.Parser)({
	            optimization: less.optimization
	        }).parse(lessText, function (e, root) {
				// Update the first LESS file to hold the full CSS text
				lessFiles[0].text = root.toCSS();
				
				options.text = '/** ' + options.id.path + ' **/';
				options.buildType = 'css';
			});
		}
	}
		
	steal({id: "./less_engine.js",ignore: true}, function(){
		if(steal.isRhino) {
			// Some monkey patching of the LESS AST
			// For production builds we NEVER want the parser to add paths to a url(),
			// the CSS postprocessor is doing that already.
			(function(tree) {
				var oldProto = tree.URL.prototype;
				tree.URL = function (val, paths) {
					if (val.data) {
						this.attrs = val;
					} else {
						this.value = val;
						this.paths = paths;
					}
				};
				tree.URL.prototype = oldProto;
			})(less.tree);
			
			// This ensures that the first LESS file always has a buildType of "css" (even if steal reset it during execution)
			// ... otherwise the builder won't find it!!
			Resource.prototype.execute = steal._after(Resource.prototype.execute, function() {
				if(this.options.ext === "less") {
					if(lessFiles.length && this.options.id === lessFiles[0].id) {
						lessFiles[0].buildType = "css";
					}
				}
			});
		}
		
		
		
		
		steal.type("less fn", function(options, success, error){
			if( importRegex.test(options.text) ) {
				// 1) parse for @imports, 
	            // 2) keep track of all files to import (with updated the file paths)
	            // 3) remove @import statements from file (replace with commented ID)
	            // 4) steal() each import 
	            // 5) place the imported content into the proper place
	            // 6) set options for build process
	            // 7) update the styles
	            var pathParts = options.src.path.split('/'),
					matchedImport,
					importsToSteal = [],
					stealId = '',
					resourceOpts;
			
				// In Rhino, leading ../ was breaking the pathing
				// TODO: find more cross-environment friendly fix for this.
				while( pathParts[0] === '..') {
					pathParts.shift();
				}
				pathParts[pathParts.length - 1] = ''; // Remove filename
				pathParts = pathParts.join('/');
				
				// 1.
				while (matchedImport = options.text.match(importRegex)) {
	                // 2.
					importsToSteal.push({
						id: pathParts + matchedImport[1],
						isImported: true
					});
					// 3.
					options.text = options.text.replace(importRegex, '/**[[' + pathParts + matchedImport[1] + ']]**/');
				}
				
				// 4.
				steal
					.apply(this, importsToSteal)
					.then(function() {
                        for(var i = 0; i < importsToSteal.length; i++) {
                        	stealId = importsToSteal[i].id,
                        	resourceOpts = steal.resources[ stealId ].options;
                        		
	                        // 5.
	                        options.text = options.text.replace('/**[[' + stealId + ']]**/', resourceOpts.text);
	                        
	                        // 6.
	                        resourceOpts.text = '/** ' + importsToSteal[i].id + ' **/';
	                        resourceOpts.buildType = 'css';
                        }
                        // 7.
						updateStyles( options );
					});
			} else if( !options.isImported ) {
				updateStyles( options );
			}
			
			// Forces steal to treat this file as text from now on
			// This is the magic that makes this all work
			options.type = "text";
			
            // Keeps the "fn" converter from doing anything
			options.skipCallbacks = true; 
			
			success();
		});
	});
})();
