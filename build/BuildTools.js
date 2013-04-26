var fs = require("fs");
var path = require("path");
var utils = require("./utils");


var uglify = function (sourceFiles, outputFile, options) {
	var jsp = require("uglify-js").parser;
	var pro = require("uglify-js").uglify;
	var code = "";
	var copyright;

	options = utils.extend({
		mangle       : true,
		toplevel     : false,
		no_functions : false
	}, options);

	// Combine JS files
	if (sourceFiles instanceof Array) {
		sourceFiles.forEach(function(filePath) {
			if (options.sourceBase) {
				filePath = path.join(options.sourceBase, filePath);
			}
			code += fs.readFileSync(filePath).toString();
		});
	} else {
		code += fs.readFileSync(sourceFiles).toString();
	}


	// Compress
	var ast = jsp.parse(code);

	ast = pro.ast_mangle(ast, options);
	ast = pro.ast_squeeze(ast);
	code = pro.gen_code(ast);

	if (outputFile) {
		fs.writeFileSync(outputFile, code);
	}
	return code;
};

var addCompat = function(options) {
	var buffer = fs.readFileSync(options.baseDir + '/o.js');

	// add normal
	if (fs.existsSync(options.targetDir + "/moxie.js")) {
		fs.appendFileSync(options.targetDir + "/moxie.js", buffer);
	}

	// ... minified
	if (fs.existsSync(options.targetDir + "/moxie.min.js")) {
		fs.appendFileSync(options.targetDir + "/moxie.min.js", uglify(options.baseDir + '/o.js', null, {
			sourceBase: options.baseDir
		}));
	}

	// .. dev/cov
	['dev', 'cov'].forEach(function(suffix) {
		var fileName = "moxie." + suffix + ".js";
		if (fs.existsSync(options.targetDir + "/" + fileName)) {
			fs.appendFileSync(options.targetDir + "/" + fileName, 
				"\n(function() {\n" +
				"	var baseDir = '';\n" +
				"	var scripts = document.getElementsByTagName('script');\n" +
				"	for (var i = 0; i < scripts.length; i++) {\n" +
				"		var src = scripts[i].src;\n" +
				"		if (src.indexOf('/" + fileName + "') != -1) {\n" +
				"			baseDir = src.substring(0, src.lastIndexOf('/'));\n" +
				"		}\n" +
				"	}\n" +
				"	document.write('<script type=\"text/javascript\" src=\"' + baseDir + '/../../" + options.baseDir + "/o.js\"></script>');\n" +
				"})();\n"
			);
		}
	});
};


var less = function (sourceFile, outputFile, options) {
	var less = require('less');

	options = utils.extend({
		compress: true,
		yuicompress: true,
		optimization: 1,
		silent: false,
		paths: [],
		color: true,
		strictImports: false
	}, options);

	var parser = new less.Parser({
		paths: [path.dirname(sourceFile)],
        optimization: options.optimization,
        filename: sourceFile,
        strictImports: options.strictImports
	});

	// Patch over BOM bug
	// Todo: Remove this when they fix the bug
	less.Parser.importer = function (file, paths, callback, env) {
		var pathname;

		paths.unshift('.');

		for (var i = 0; i < paths.length; i++) {
			try {
				pathname = path.join(paths[i], file);
				fs.statSync(pathname);
				break;
			} catch (e) {
				pathname = null;
			}
		}

		if (pathname) {
			fs.readFile(pathname, 'utf-8', function(e, data) {
				if (e) return callback(e);

				data = data.replace(/^\uFEFF/, '');

				new(less.Parser)({
					paths: [path.dirname(pathname)].concat(paths),
					filename: pathname
				}).parse(data, function (e, root) {
					callback(e, root, data);
				});
			});
		} else {
			if (typeof(env.errback) === "function") {
				env.errback(file, paths, callback);
			} else {
				callback({ type: 'File', message: "'" + file + "' wasn't found.\n" });
			}
		}
	};

	parser.parse(fs.readFileSync(sourceFile).toString(), function (err, tree) {
		if (err) {
			less.writeError(err, options);
			return;
		}

		fs.writeFileSync(outputFile, tree.toCSS({
			compress: options.compress,
			yuicompress: options.yuicompress
		}));
	});
};

var yuidoc = function (sourceDir, outputDir, options) {
	var Y = require('yuidocjs');

	if (!(sourceDir instanceof Array)) {
		sourceDir = [sourceDir];
	}

	options = utils.extend({
		paths: sourceDir,
		outdir: outputDir,
		time: false
	}, options);

	var starttime = new Date().getTime();
	var json = (new Y.YUIDoc(options)).run();

	var builder = new Y.DocBuilder(options, json);
	builder.compile(function() {
		var endtime = new Date().getTime();

		if (options.time) {
			Y.log('Completed in ' + ((endtime - starttime) / 1000) + ' seconds' , 'info', 'yuidoc');
		}

		complete();
	});
};

var jshint = function (sourceDir, options) {
	var jshint = require('jshint').JSHINT;

	var color = function(s, c){
		return (color[c].toLowerCase()||'') + s + color.reset;
	};

	color.reset = '\u001b[39m';
	color.red = '\u001b[31m';
	color.yellow = '\u001b[33m';
	color.green = '\u001b[32m';

	function process(filePath) {
		var stat = fs.statSync(filePath);

		if (stat.isFile() && path.extname(filePath) == '.js') {
			if (!jshint(fs.readFileSync(filePath).toString(), options)) {
				// Print the errors
				console.log(color('Errors in file ' + filePath, 'red'));
				var out = jshint.data(),
				errors = out.errors;
				Object.keys(errors).forEach(function(error){
					error = errors[error];

					console.log('line: ' + error.line + ':' + error.character+ ' -> ' + error.reason );
					console.log(color(error.evidence,'yellow'));
				});
			}
		} else if (stat.isDirectory()) {
			fs.readdirSync(filePath).forEach(function(fileName) {
				process(path.join(filePath, fileName));
			});
		}
	}

	options = utils.extend({
		boss: true,
		forin: false,
		curly: true,
		smarttabs: true
	}, options);

	process(sourceDir);
};

var zip = function (sourceFiles, zipFile, options) {
	var zip = require("node-native-zip");
	var archive = new zip();

	var files = [];

	function process(filePath, zipFilePath) {
		var stat = fs.statSync(filePath);

		zipFilePath = zipFilePath || filePath;

		if (stat.isFile()) {
			files.push({ name: zipFilePath, path: filePath });
		} else if (stat.isDirectory()) {
			fs.readdirSync(filePath).forEach(function(fileName) {
				if (/^[^\.]/.test(fileName)) {
					process(path.join(filePath, fileName), path.join(zipFilePath, fileName));
				}
			});
		}
	}

	options = utils.extend({
	}, options);

	sourceFiles.forEach(function(filePath) {
		if (filePath instanceof Array) {
			process(filePath[0], filePath[1]);
		} else {
			process(filePath);
		}
	});

	archive.addFiles(files, function() {
		archive.toBuffer(function(buffer) {
			fs.writeFileSync(zipFile, buffer);
		});
	});
};

var copySync = function(from, to) {
	var stat = fs.statSync(from);

	function copyFile(from, to) {
		try {
			fs.createReadStream(from).pipe(fs.createWriteStream(to));
		} catch(ex) {
			console.info("Error: cannot copy " + from + " " + to);
			//process.exit(1);
		}
	}

	if (stat.isFile()) {
		copyFile(from, to);
	} else if (stat.isDirectory()) {
		/*fs.readdirSync(from).forEach(function(fileName) {
			copySync(from, to)
		});*/
		console.info("Error: " + from + " is directory");
	}
};


// extract version details from chengelog.txt
var getReleaseInfo = function (srcPath) {
	if (!fs.existsSync(srcPath)) {
		console.info(srcPath + " cannot be found.");
		process.exit(1);
	} 
	
	var src = fs.readFileSync(srcPath).toString();

	var info = src.match(/Version ([0-9xabrc\.]+)[^\(]+\(([^\)]+)\)/);
	if (!info) {
		console.info("Error: Version cannot be extracted.");
		process.exit(1);
	}

	return {
		version: info[1],
		releaseDate: info[2],
		fileVersion: info[1].replace(/\./g, '_')
	}
};

// inject version details and copyright header if available to all js files in specified directory
var addReleaseDetailsTo = function (destPath, info) {
	var self = this, headNote, headNotePath = "./build/headnote.txt";

	function processFile(filePath) {

		if (headNote) {
			contents = headNote + "\n" + fs.readFileSync(filePath);
		}

		contents = contents.replace(/@@([^@]+)@@/g, function($0, $1) {
			switch ($1) {
				case "version": return info.version;
				case "releasedate": return info.releaseDate;
			}
		});

		fs.writeFileSync(filePath, contents);
	}

	function isTextFile(filePath) {
		return /\.(js|txt)$/.filePath;
	}
	
	if (fs.existsSync(headNotePath)) {
		headNote = fs.readFileSync(headNotePath).toString();
	}

	var stat = fs.statSync(destPath);

	if (stat.isFile()) {
		processFile(destPath);
	} else if (stat.isDirectory()) {
		fs.readdirSync(destPath).forEach(function(fileName) {
			self.addReleaseDetailsTo(path.join(destPath, fileName), info);
		});
	}
};


function compileAmd(options) {
	require("amdlc").compile(options);
}

utils.extend(exports, {
	uglify: uglify,
	less: less,
	yuidoc: yuidoc,
	jshint: jshint,
	zip: zip,
	copySync: copySync,
	addCompat: addCompat,
	getReleaseInfo: getReleaseInfo,
	addReleaseDetailsTo: addReleaseDetailsTo,
	compileAmd: compileAmd
});