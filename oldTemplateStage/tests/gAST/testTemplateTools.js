// this file is a library containing functions

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
// escodegen
var escodegen = require('escodegen')


module.exports = {
	// makeASTs
		// input: array of scripts
		// output: array of ASTs using esprima
	makeASTs: function (inArray){
		outArray = [];
		for (i in inArray){
			outArray[i] = esprima.parse(inArray[i].script);
		}
		return outArray;
	},

	makegASTObjects: function (inArray){
		outObj = {gASTs: [], ASTGhosts: []};
		for (i in inArray){
			outObj.gASTs[i] = makegASTObject(inArray[i]).gAST;
			outObj.ASTGhosts[i] = makegASTObject(inArray[i]).ASTGhost;
		}
		return outObj;

		// functions --------------

		function makegASTObject(AST){
			gASTObject = {};
			gASTObject.gAST = JSON.parse(JSON.stringify(AST));
			gASTObject.ASTGhost = [];
			path = "";
			gASTcount = 1;
			// using AST relative to path, write to gAST and ghost
			traverseTree(gASTObject.gAST, gASTObject.ASTGhost, path);
			return gASTObject;
		}

		function traverseTree(object, ghostArray, path){
			// if is a node, add node label and modify gAST, ghostArray
			if (object.type != undefined){
				// add node label
				object.ASTNodeID = "node" + String(gASTcount);
				gASTcount++;

				// get object info
				objInfo = processObj(object);
				// handle complex data nodes, return nonnested object
				// if (objInfo.needsNonNested){
				// 	// makeNonNestedObject(object, path, 0);

				// 	propName = "value";
				// 	// add to ghostArray
				// 	tempObj = {};
				// 	tempObj.relPath = path + "[\"" + propName + "\"]";
				// 	tempObj.valueAtRelPath = object[propName];
				// 	ghostArray.push(tempObj);

				// 	// remove from gAST
				// 	delete object[propName];

				// 	// do not traverse any more
				// 	return
				// }
				// modify gAST
				if (objInfo.tag != null){object.tag = objInfo.tag;}
				if (objInfo.value != null){object.value = objInfo.value;}

				// for each modification, add to ghostArray and delete from gAST
				for (i in objInfo.propsToRemove){
					if (objInfo.propsToRemove[i] == "value"){
						if (typeof object.value == "object"){
							console.log("freakout");
						}
						propName = objInfo.propsToRemove[i];
						// add to ghostArray
						tempObj = {};
						tempObj.relPath = path + "[\"" + propName + "\"]";
						tempObj.valueAtRelPath = object[propName];
						ghostArray.push(tempObj);
						// remove from gAST
						delete object[propName];
					}
					else {
						propName = objInfo.propsToRemove[i];
						// add to ghostArray
						tempObj = {};
						tempObj.relPath = path + "[\"" + propName + "\"]";
						tempObj.valueAtRelPath = object[propName];
						ghostArray.push(tempObj);
						// remove from gAST
						delete object[propName];
					}
				}
			}

			// traverse all, do something for only objects and arrays
			for(var key in object) {
		    if((object.hasOwnProperty(key)) && (object[key] != null) && (typeof object[key] == "object")) {
		    	// for testing
		    	// object.path = path;
		    	traverseTree(object[key], ghostArray, path + "[\"" + key + "\"]");
		    }
			}


		
			// functions --------------------------------------------

			function processObj(node){
				// returns:
				// .key string
				// .value string
				// .propsToRemove array of strings
				toReturn = {tag: null, value: null, propsToRemove: [], needsNonNested: false};

				switch (object.type){
					// structure nodes (dowhile, if)
					// operator nodes (assign, binop)
					// tag = classname (assign, dowhile)
					// value = null
					case "VariableDeclaration":
						toReturn.tag = object.kind;
						break;
					case "CallExpression":
					case "Program":
					case "VariableDeclarator":
						toReturn.tag = object.type;		
						break;

					// identifier toReturns (identifier)
					// tag = toReturn value (CNN, configobj)
					// value = null
					case "Identifier":
						toReturn.tag = object.name;
						break;

					// atomic data toReturn (number, string)
					// tag = classname (number, string)
					// value = toReturn value	(politics/...gwx.cnn)
					case "Literal":
						toReturn.tag = typeof object.value;
						toReturn.value = object.value;
						toReturn.propsToRemove.push("value");
						break;

					// complex data toReturn (array, object)
					// tag = class name (array, object)
					// value = nonnested object
					case "ObjectExpression": 		// parent representing object
					case "ArrayExpression": 		// parent representing array
						toReturn.tag = typeof object.value;
						toReturn.needsNonNested = true;
						//toReturn.propsToRemove.push("");
						break;

					// other toReturn
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
						toReturn.tag = object.type;
						break;
					default:
						toReturn.tag = object.type;
						console.log("new (unknown) case to add to switch of type: " + object.type);
						break;
				}

				return toReturn;
			}

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
		}
	},

	makeASTAgain: function(gASTArray, ghostArray){
		ASTAgain = [];
		for (i in gASTArray){
			ASTAgain.push(makeASTAgain(gASTArray[i], ghostArray[i]));
		}
		return ASTAgain;

		// function --------------------------------

		function makeASTAgain(gAST, ghost){
			for (i in ghost){
				path = ghost[i].relPath;
				value = ghost[i].valueAtRelPath;
				node = objByString(gAST, path);

				// put back value
				node.value = value;

				// remove ASTNodeID
				delete node.ASTNodeID;

				// remove tag
				delete node.tag;
			}

			return removeExtras(gAST);
		}

		function objByString(o, s) {
			s = s.replace(/\["[^"]*"\]/g, function(x){return "."+x.slice(2, x.length-2)}); // convert indexes to properties
			s = s.replace(/^\./, '');           // strip a leading dot
			s = s.replace(/\.$/, '');			// strip trailing dot
			var a = s.split('.');

			// remove trailing "value". Want node object not value property of that object
			if (a[a.length-1]=="value"){a.pop();}

			for (var i = 0, n = a.length; i < n; ++i) {
				var k = a[i];
				if (o == undefined){
					console.log("break here");
				}
				if (k in o) {
					o = o[k];
				}
				else {
					return;
				}
			}
			return o;
		}

		function removeExtras(object){
			if (object.ASTNodeID){delete object.ASTNodeID;}
			if (object.tag){delete object.tag;}

			for(var key in object) {

				
			// if((typeof object[key] == "object")) {
			if((object.hasOwnProperty(key)) && (object[key] != null) && (typeof object[key] == "object")) {
				removeExtras(object[key]);
			}
			}
			return object;
		}
	},
	makeScriptAgain: function(ASTArray){
		scriptsArr = [];
		for (i in ASTArray){
			scriptsArr.push(makeScript(ASTArray[i]));
		}
		return scriptsArr;

		// function --------------

		function makeScript(ast){
			return escodegen.generate(ast);
		}
	},
	makeScriptAgainFake: function(ASTArray){
		scriptsArr = [];
		for (i in ASTArray){
			scriptsArr.push(makeScript(ASTArray[i]));
		}
		return scriptsArr;

		// function --------------

		function makeScript(ast){
			return escodegen.generate(ast);
		}
	},
	modit: function(inArr){

		return traverse(inArr[0]);

		function traverse(obj){
			if (typeof obj == "object"){	
			for (var key in obj) {
			if (obj.hasOwnProperty(key)) {
				if (obj.length == undefined){

					obj.keyone = "something";
				}
				traverse(obj[key]);
			}
			}
			return [obj];
			}
		}
	},
	putitback: function(inArr){
		return traverse(inArr[0]);

		function traverse(obj){
			if (typeof obj == "object"){	
			for (var key in obj) {
			if (obj.hasOwnProperty(key)) {
				if (obj.hasOwnProperty("keyone")){
					delete obj["keyone"];
				}
				traverse(obj[key]);
			}
			}
			}
			return [obj];
		}
	},
};



	