// Returns if script(s) match templates stored on the MongoDB database
// call with "node ifMatch.js dbName collectionName [script ObjectID]"
// many scripts example: "node ifMatch.js webcontents purescripts"
// single script example: "node ifMatch.js webcontents purescripts 56f2eea51cd7e16f99b900ee
// dbName is the name of the MongoDB database containing the script to query
// collectionName is the collection containing the script(s)
// scriptQuery is the optional argument to specify the script to query for 
// 		uses MongoDB collection find() syntax

// MongoDB
var Db = require('mongodb').Db,
    MongoClient = require('mongodb').MongoClient,
    Server = require('mongodb').Server,
    ReplSetServers = require('mongodb').ReplSetServers,
    ObjectID = require('mongodb').ObjectID,
    Binary = require('mongodb').Binary,
    GridStore = require('mongodb').GridStore,
    Grid = require('mongodb').Grid,
    Code = require('mongodb').Code,
    // BSON = require('mongodb').pure().BSON,
    assert = require('assert');
// Esprima
var esprima = require('esprima');

// global stuff in here
dat = {
	scripts: [],		// array of scripts read in
	ASTs: [],			// array of ASTs
	gASTs: [],			// array of gASTs
	hashes: [],			// array of hashes
}

// Check call, get source and destination addresses
numOfArgs = process.argv.length;
if ((numOfArgs < 3) || (numOfArgs > 5)){
	console.log("improper call. Call with:\nnode ifMatch.js dbName collectionName [scriptQuery]");
	return;
}

dbName = String(process.argv[2]);
collName = String(process.argv[3]);
var scriptQuery; var ifSingle = false;
if (numOfArgs == 5){
	scriptQuery = {"_id": new ObjectID(String(process.argv[4]))};
	ifSingle = true;
}

// get scripts, flow continues at function "gotScripts"
MongoClient.connect("mongodb://localhost:27017/" + dbName, {native_parser:true}, function(err, db) {
	assert.equal(null, err);
	if (ifSingle){
		db.collection(collName).findOne(scriptQuery, function(err, item) {
			assert.equal(null, err);
			console.log("collection: " + collName);
			console.log("got: " + JSON.stringify(item));
			if (item != null){
				dat.scripts.push(item);
			}
			db.close();
			gotScripts();
		})
	}
	else {
		var cursor = db.collection(collName).find();
		cursor.each(function(err, doc) {
			assert.equal(err, null);
			if (doc != null) {
				dat.scripts.push(doc);
			} else {
				db.close();
				gotScripts();
			}
		});
	}
});

// gotScripts()
	// scripts in array dat.scripts
	// each element is object with fields
	// hostname, script, url
	// these fields contain strings
	// for each script, make AST, gAST, hash
	// flow continues at makeTemplate
function gotScripts(){
	// decode from base64
	dat.scripts = processScripts(dat.scripts);
	// make ASTs
	dat.ASTs = makeASTs(dat.scripts);
	// make gASTs
	dat.gASTs = makegASTs(dat.ASTs);
	// make hashes
	dat.hashes = makeHashes(dat.gASTs);
	return;
}

// processScripts()
	// given input array of script objects, decode string in 
	// "script" field from base 64
function processScripts(inArray){
	outArray = [];
	for (i in inArray){
		tempObj = inArray[i];
		tempObj.script = (new Buffer(inArray[i].script, 'base64')).toString();	// decode
		//trim(	// trim
		if (validScriptString(tempObj.script)){
			outArray.push(tempObj);
		}
		function validScriptString(str){
			if  ((str == "//thistagisintentionallyblank") ||
				(str.length < 3) ||
				(str == null) ||
				(str == "null") ||
				(str == undefined) ||
				(str == "undefined")){
				return false
			}
			return true;
		}
	}
	return outArray
}

// makeASTs
	// input: array of scripts
	// output: array of ASTs using esprima
function makeASTs(inArray){
	outArray = [];
	for (i in inArray){
		outArray[i] = esprima.parse(inArray[i].script);
	}
	function trim(string){
		// strings always have ( at the beginning and )(); at the end
		// remove these
		if ((string[0] = "(") && (string[string.length - 1] == ";")){
			string = string.slice(1, string.length - 4)
		}
		return string;
	}
	return outArray;
}

// makegASTs
	// input: array of ASTs (objects)
	// output: array of gASTs (objects)
function makegASTs(inArray){
	outArray = [];
	for (i in inArray){
		// write gAST of inArray[i] to outArray[i]
		traverseTree(inArray[i], "outArray[i]", 0);
	}
	return outArray;

	// traverseTree
		// given remaining AST object and path to gAST so far,
		// process immediate level of object and traverse children
	function traverseTree(object, path, gASTcount){
		// check current object
		if(object.type != undefined){
			// make node object with null tag and value properties
			if (typeof eval(path) != "object"){
				eval(path + "={tag: null, value: null,};");
			}
			else {
				eval(path + ".tag = null; " + path + ".value = null;");
			}

			// get node tag and value
			nodeInfo = processNode(object);

			// set node tag and value
			if (nodeInfo.tag != null){
		   		eval(path + ".tag = \"" + String(nodeInfo.tag) + "\";");
			}
			if (nodeInfo.value != null){
				eval(path + ".value = \"" + String(nodeInfo.value) + "\";");
			}

			// handle complex data nodes, return nonnested object
			if (node.needsNonNested){
				makeNonNestedObject(object, path, 0);
				// do not traverse any more
				return
			}

			// increment node id
			gASTcount++;
			eval("outArray[i].count = " + gASTcount + ";");
		}


		// traverse all, do something for only objects and arrays
		for(var key in object) {
	    if((object.hasOwnProperty(key)) && (object[key] != null) && (typeof object[key] == "object")) {
			// node
			if(object[key].type != undefined){
				//console.log("node");
				traverseTree(object[key], path + ".node" + gASTcount, gASTcount);
			}
			// array
			else if (object[key].length >= 1){
				//console.log("array");
				traverseTree(object[key], path, gASTcount);
			}
			// nonnode object
			else { 
				//console.log("nonnode object");
				traverseTree(object[key], path, gASTcount);
			}
	    }
		}
	}

	// processNode
		/*
		Process Node: these are nodes that should be written to the gAST
		Nodes are always AST objects, and always have type field
		AST contains more information than needed, so not all AST objects are nodes
		Chief goal of this function is to determin tag and value of the gAST node

		esprima types are same as mozilla spidermonkey api
		https://developer.mozilla.org/en-US/docs/Mozilla/Projects/SpiderMonkey/Parser_API

		node.tag: tag for that gAST node
		node.value: value for that gAST node
		node.needsNonNested: control variable, true if gAST node needs to be a nonnested
			object. NOT to be written literally to that gAST node
		*/
	function processNode(object){
		node = {tag: null, value: null, needsNonNested: null};
		switch (object.type){
			// structure nodes (dowhile, if)
			// operator nodes (assign, binop)
			// tag = classname (assign, dowhile)
			// value = null
			case "VariableDeclaration":
				node.tag = object.kind;
				break;
			case "CallExpression":
			case "Program":
			case "VariableDeclarator":
				node.tag = object.type;		
				break;

			// identifier nodes (identifier)
			// tag = node value (CNN, configobj)
			// value = null
			case "Identifier":
				node.tag = object.name;
				break;

			// atomic data node (number, string)
			// tag = classname (number, string)
			// value = node value	(politics/...gwx.cnn)
			case "Literal":
				node.tag = typeof object.value;
				node.value = object.value;
				break;

			// complex data node (array, object)
			// tag = class name (array, object)
			// value = nonnested object
			case "ObjectExpression": 		// parent representing object
			case "ArrayExpression": 		// parent representing array
				node.tag = typeof object.value;
				node.needsNonNested = true;
				break;

			// other node
			// tag = class name (object.type)
			case "Property":
			case "ObjectPattern":
			case "ArrayPattern":
			case "IfStatement":
			case "SwitchStatement":
			case "BreakStatement":
			case "ContinueStatement":
			case "WithStatement":
			case "SwitchCase":
			case "NewExpression":
			case "WhileStatement":
			case "DoWhileStatement":
			case "ForStatement":
			case "ForInStatement":
			case "ForOfStatement":
			case "ReturnStatement":
			case "FunctionDeclaration":	
			case "FunctionExpression":
			case "BlockStatement":
			case "ExpressionStatement":
			case "LabeledStatement":
			case "ThrowStatement":
			case "TryStatement":
			case "LetStatement":
			case "DebuggerStatement":
			case "EmptyStatement":
			case "ThisExpression":
			case "ArrowExpression":
			case "SequenceExpression":
			case "UnaryExpression":
			case "BinaryExpression":
			case "AssignmentExpression":
			case "UpdateExpression":
			case "LogicalExpression":
			case "ConditionalExpression":
			case "MemberExpression":
			case "YieldExpression":
			case "ComprehensionExpression":
			case "GeneratorExpression":
			case "GraphExpression":
			case "GraphIndexExpression":
			case "LetExpression":
			case "CatchClause":
			case "ComprehensionBlock":
			case "ComprehensionIf":
			case "XMLDefaultDeclaration":
			case "XMLAnyName":
			case "XMLQualifiedIdentifier":
			case "XMLFunctionQualifiedIdentifier":
			case "XMLAttributeSelector":
			case "XMLFilterExpression":
			case "XMLElement":
			case "XMLList":
			case "XMLEscape":
			case "XMLText":
			case "XMLStartTag":
			case "XMLEndTag":
			case "XMLPointTag":
			case "XMLName":
			case "XMLAttribute":
			case "XMLCdata":
			case "XMLComment":
			case "XMLProcessingInstruction":
				node.tag = object.type;
				break;
			default:
				node.tag = object.type;
				console.log("new (unknown) case to add to switch of type: " + object.type);
				break;
		}
		return node;
	}

	// makeNonNestedObject
		/*
		makeNonNestedObject
		makes a non nested object for object, at path (of the gAST)
		traverses everything in the object (the else case)
		writes to the nonnested object if there is a literal
		*/
	function makeNonNestedObject(object, path, depth){
		// make nonnestedobject if not exist
		// only happens on the first call before recursion
		if ((eval(path + ".value") == null) || (eval(path + ".value") == undefined)){
			eval(path + ".tag = \"non_nested_obj\"");
			eval(path + ".value = {}");
		}

		// traverse all, do something for only objects and arrays
		for(var key in object) {
	    if((object.hasOwnProperty(key)) && (object[key] != null) && (typeof object[key] == "object")) {
			// node
			if(object[key].type != undefined){
				doTag(object[key], path, depth);
			}
			// to if((object.hasOwnProperty(key)) &&traverse
			else {
				makeNonNestedObject(object[key], path, depth);
			}
	    }
		}
	}

	// doTag
		/*
		called when something needs to be written to the nonnested object at "path"
		take that object, find how to write it, and write it
		check if the array to be written to already exists, write accordingly
		*/
	function doTag(object, path, depth){
		switch (object.type){
			case "ArrayExpression":
				// parent node of an array
				// continue traversal with depth++
			case "ObjectExpression":
				// parent node of an object
				// continue traversal with depth++
				makeNonNestedObject(object, path, depth+1);
				break;
			case "elements":
				// elements of an array, array elements in here
				// don't do anything until seeing the elements
				// traverse to see the elements
			case "properties": 
				// array containing object properties (the case below this)
				// don't do anything until seeing each property element
				// traverse to see the properties
				makeNonNestedObject(object, path, depth);	// seeing the elements/properties
				break;
			case "Property":
				// property of an object, value in .key.name
				pushPath = path + ".value." + String(object.key.name);
				pushValue = "\"" + String(object.value.value) + "\"";
				pushToNonNested(pushPath, pushValue);
				break;	// not doing anything
			case "Identifier":
				// pushPath = path + ".value.CSP_identifier";
				// pushValue = object.name;
				// pushToNonNested(pushPath, pushValue);
				return; // do nothing, identifier is insignificant
			case "Literal":
				if (object.value == null){
					return;
				}
				// something to write to array for
				switch (typeof object.value){
					case "number":
						pushPath = path + ".value.CSP_number";
						pushValue = object.value;
						pushToNonNested(pushPath, pushValue);
						break;
					case "string":
						pushPath = path + ".value.CSP_string_lev" + depth;
						pushValue = "\"" + object.value + "\"";
						pushToNonNested(pushPath, pushValue);
						break;
					case "boolean":
						pushPath = path + ".value.CSP_boolean";
						pushValue = object.value;
						pushToNonNested(pushPath, pushValue);
						break;
					default:
						console.log("unhandled typeof for literal type in nonnested handler with typeof: " + typeof object.value);
				}
				break;
			default:
				console.log("unhandled dotag case of type: " + object.type);
				break;
		}
	}

	// pushToNonNested
		/*
		pushes pushValue to array at pushPath
		*/
	function pushToNonNested(pushPath, pushValue){
		// make array if not exist
		if (eval(pushPath) == undefined){
			eval(pushPath + "=[]");
		}
		// write to
		//console.log("pushPath0: " + pushPath );
		eval(pushPath  + ".push(" + pushValue + ")");
	}
}

// makeHashes
	// input: array of gASTS (object types)
	// output: array of hashes (string types)
function makeHashes(inArray){
	outArray = [];
	for (i in inArray){
		outArray[i] = makeHash(inArray[i], "");
	}
	return outArray;

	// recursively traverse the gAST to make the hash
	function makeHash(obj, hash){
		// check
		if (typeof obj != "object"){
			console.log("error, cannot make hash: item is not a gAST object");
		}

		// traverse all nested nodes
		for(var key in obj) {
			if (getIfNode(key)){
				hash = makeHash(obj[key], hash);
				hash = hash.concat(key);
				hash = hash.concat(": tag=");
				hash = hash.concat(obj.tag);
				hash = hash.concat(", value=");
				hash = hash.concat(obj.value);
				hash = hash.concat("; ");
			}
		}

		return hash;

		// getIfNode
		// true if object is a gAST node
		// i.e. if the name begins with "node"
		function getIfNode(key){
			if (key.substring(0, 4) == "node"){
				return true;
			}
			return false;
		}
	}
}