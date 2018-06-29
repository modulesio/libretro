var Module = typeof Module !== "undefined" ? Module : {};
var moduleOverrides = {};
var key;
for (key in Module) {
    if (Module.hasOwnProperty(key)) {
        moduleOverrides[key] = Module[key]
    }
}
var ENVIRONMENT_IS_WEB = false;
var ENVIRONMENT_IS_WORKER = false;
var ENVIRONMENT_IS_NODE = false;
var ENVIRONMENT_IS_SHELL = false;
if (Module["ENVIRONMENT"]) {
    if (Module["ENVIRONMENT"] === "WEB") {
        ENVIRONMENT_IS_WEB = true
    } else if (Module["ENVIRONMENT"] === "WORKER") {
        ENVIRONMENT_IS_WORKER = true
    } else if (Module["ENVIRONMENT"] === "NODE") {
        ENVIRONMENT_IS_NODE = true
    } else if (Module["ENVIRONMENT"] === "SHELL") {
        ENVIRONMENT_IS_SHELL = true
    } else {
        throw new Error("The provided Module['ENVIRONMENT'] value is not valid. It must be one of: WEB|WORKER|NODE|SHELL.")
    }
} else {
    ENVIRONMENT_IS_WEB = typeof window === "object";
    ENVIRONMENT_IS_WORKER = typeof importScripts === "function";
    ENVIRONMENT_IS_NODE = typeof process === "object" && typeof require === "function" && !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_WORKER;
    ENVIRONMENT_IS_SHELL = !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_NODE && !ENVIRONMENT_IS_WORKER
}
if (ENVIRONMENT_IS_NODE) {
    if (!Module["print"]) Module["print"] = console.log;
    if (!Module["printErr"]) Module["printErr"] = console.warn;
    var nodeFS;
    var nodePath;
    Module["read"] = function shell_read(filename, binary) {
        var ret;
        if (!nodeFS) nodeFS = require("fs");
        if (!nodePath) nodePath = require("path");
        filename = nodePath["normalize"](filename);
        ret = nodeFS["readFileSync"](filename);
        return binary ? ret : ret.toString()
    };
    Module["readBinary"] = function readBinary(filename) {
        var ret = Module["read"](filename, true);
        if (!ret.buffer) {
            ret = new Uint8Array(ret)
        }
        assert(ret.buffer);
        return ret
    };
    if (!Module["thisProgram"]) {
        if (process["argv"].length > 1) {
            Module["thisProgram"] = process["argv"][1].replace(/\\/g, "/")
        } else {
            Module["thisProgram"] = "unknown-program"
        }
    }
    Module["arguments"] = process["argv"].slice(2);
    if (typeof module !== "undefined") {
        module["exports"] = Module
    }
    process["on"]("uncaughtException", (function(ex) {
        if (!(ex instanceof ExitStatus)) {
            throw ex
        }
    }));
    process["on"]("unhandledRejection", (function(reason, p) {
        process["exit"](1)
    }));
    Module["inspect"] = (function() {
        return "[Emscripten Module object]"
    })
} else if (ENVIRONMENT_IS_SHELL) {
    if (!Module["print"]) Module["print"] = print;
    if (typeof printErr != "undefined") Module["printErr"] = printErr;
    if (typeof read != "undefined") {
        Module["read"] = function shell_read(f) {
            return read(f)
        }
    } else {
        Module["read"] = function shell_read() {
            throw "no read() available"
        }
    }
    Module["readBinary"] = function readBinary(f) {
        var data;
        if (typeof readbuffer === "function") {
            return new Uint8Array(readbuffer(f))
        }
        data = read(f, "binary");
        assert(typeof data === "object");
        return data
    };
    if (typeof scriptArgs != "undefined") {
        Module["arguments"] = scriptArgs
    } else if (typeof arguments != "undefined") {
        Module["arguments"] = arguments
    }
    if (typeof quit === "function") {
        Module["quit"] = (function(status, toThrow) {
            quit(status)
        })
    }
} else if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
    Module["read"] = function shell_read(url) {
        var xhr = new XMLHttpRequest;
        xhr.open("GET", url, false);
        xhr.send(null);
        return xhr.responseText
    };
    if (ENVIRONMENT_IS_WORKER) {
        Module["readBinary"] = function readBinary(url) {
            var xhr = new XMLHttpRequest;
            xhr.open("GET", url, false);
            xhr.responseType = "arraybuffer";
            xhr.send(null);
            return new Uint8Array(xhr.response)
        }
    }
    Module["readAsync"] = function readAsync(url, onload, onerror) {
        var xhr = new XMLHttpRequest;
        xhr.open("GET", url, true);
        xhr.responseType = "arraybuffer";
        xhr.onload = function xhr_onload() {
            if (xhr.status == 200 || xhr.status == 0 && xhr.response) {
                onload(xhr.response);
                return
            }
            onerror()
        };
        xhr.onerror = onerror;
        xhr.send(null)
    };
    if (typeof arguments != "undefined") {
        Module["arguments"] = arguments
    }
    if (typeof console !== "undefined") {
        if (!Module["print"]) Module["print"] = function shell_print(x) {
            console.log(x)
        };
        if (!Module["printErr"]) Module["printErr"] = function shell_printErr(x) {
            console.warn(x)
        }
    } else {
        var TRY_USE_DUMP = false;
        if (!Module["print"]) Module["print"] = TRY_USE_DUMP && typeof dump !== "undefined" ? (function(x) {
            dump(x)
        }) : (function(x) {})
    }
    if (typeof Module["setWindowTitle"] === "undefined") {
        Module["setWindowTitle"] = (function(title) {
            document.title = title
        })
    }
} else {
    throw new Error("Unknown runtime environment. Where are we?")
}
if (!Module["print"]) {
    Module["print"] = (function() {})
}
if (!Module["printErr"]) {
    Module["printErr"] = Module["print"]
}
if (!Module["arguments"]) {
    Module["arguments"] = []
}
if (!Module["thisProgram"]) {
    Module["thisProgram"] = "./this.program"
}
if (!Module["quit"]) {
    Module["quit"] = (function(status, toThrow) {
        throw toThrow
    })
}
Module.print = Module["print"];
Module.printErr = Module["printErr"];
Module["preRun"] = [];
Module["postRun"] = [];
for (key in moduleOverrides) {
    if (moduleOverrides.hasOwnProperty(key)) {
        Module[key] = moduleOverrides[key]
    }
}
moduleOverrides = undefined;
var STACK_ALIGN = 16;

function staticAlloc(size) {
    assert(!staticSealed);
    var ret = STATICTOP;
    STATICTOP = STATICTOP + size + 15 & -16;
    return ret
}

function dynamicAlloc(size) {
    assert(DYNAMICTOP_PTR);
    var ret = HEAP32[DYNAMICTOP_PTR >> 2];
    var end = ret + size + 15 & -16;
    HEAP32[DYNAMICTOP_PTR >> 2] = end;
    if (end >= TOTAL_MEMORY) {
        var success = enlargeMemory();
        if (!success) {
            HEAP32[DYNAMICTOP_PTR >> 2] = ret;
            return 0
        }
    }
    return ret
}

function alignMemory(size, factor) {
    if (!factor) factor = STACK_ALIGN;
    var ret = size = Math.ceil(size / factor) * factor;
    return ret
}

function getNativeTypeSize(type) {
    switch (type) {
        case "i1":
        case "i8":
            return 1;
        case "i16":
            return 2;
        case "i32":
            return 4;
        case "i64":
            return 8;
        case "float":
            return 4;
        case "double":
            return 8;
        default:
            {
                if (type[type.length - 1] === "*") {
                    return 4
                } else if (type[0] === "i") {
                    var bits = parseInt(type.substr(1));
                    assert(bits % 8 === 0);
                    return bits / 8
                } else {
                    return 0
                }
            }
    }
}

function warnOnce(text) {
    if (!warnOnce.shown) warnOnce.shown = {};
    if (!warnOnce.shown[text]) {
        warnOnce.shown[text] = 1;
        Module.printErr(text)
    }
}
var functionPointers = new Array(0);
var funcWrappers = {};

function dynCall(sig, ptr, args) {
    if (args && args.length) {
        return Module["dynCall_" + sig].apply(null, [ptr].concat(args))
    } else {
        return Module["dynCall_" + sig].call(null, ptr)
    }
}
var Runtime = {
    dynCall: dynCall
};
var GLOBAL_BASE = 1024;
var ABORT = 0;
var EXITSTATUS = 0;

function assert(condition, text) {
    if (!condition) {
        abort("Assertion failed: " + text)
    }
}

function getCFunc(ident) {
    var func = Module["_" + ident];
    assert(func, "Cannot call unknown function " + ident + ", make sure it is exported");
    return func
}
var JSfuncs = {
    "stackSave": (function() {
        stackSave()
    }),
    "stackRestore": (function() {
        stackRestore()
    }),
    "arrayToC": (function(arr) {
        var ret = stackAlloc(arr.length);
        writeArrayToMemory(arr, ret);
        return ret
    }),
    "stringToC": (function(str) {
        var ret = 0;
        if (str !== null && str !== undefined && str !== 0) {
            var len = (str.length << 2) + 1;
            ret = stackAlloc(len);
            stringToUTF8(str, ret, len)
        }
        return ret
    })
};
var toC = {
    "string": JSfuncs["stringToC"],
    "array": JSfuncs["arrayToC"]
};

function ccall(ident, returnType, argTypes, args, opts) {
    var func = getCFunc(ident);
    var cArgs = [];
    var stack = 0;
    if (args) {
        for (var i = 0; i < args.length; i++) {
            var converter = toC[argTypes[i]];
            if (converter) {
                if (stack === 0) stack = stackSave();
                cArgs[i] = converter(args[i])
            } else {
                cArgs[i] = args[i]
            }
        }
    }
    var ret = func.apply(null, cArgs);
    if (returnType === "string") ret = Pointer_stringify(ret);
    if (stack !== 0) {
        stackRestore(stack)
    }
    return ret
}

function setValue(ptr, value, type, noSafe) {
    type = type || "i8";
    if (type.charAt(type.length - 1) === "*") type = "i32";
    switch (type) {
        case "i1":
            HEAP8[ptr >> 0] = value;
            break;
        case "i8":
            HEAP8[ptr >> 0] = value;
            break;
        case "i16":
            HEAP16[ptr >> 1] = value;
            break;
        case "i32":
            HEAP32[ptr >> 2] = value;
            break;
        case "i64":
            tempI64 = [value >>> 0, (tempDouble = value, +Math_abs(tempDouble) >= 1 ? tempDouble > 0 ? (Math_min(+Math_floor(tempDouble / 4294967296), 4294967295) | 0) >>> 0 : ~~+Math_ceil((tempDouble - +(~~tempDouble >>> 0)) / 4294967296) >>> 0 : 0)], HEAP32[ptr >> 2] = tempI64[0], HEAP32[ptr + 4 >> 2] = tempI64[1];
            break;
        case "float":
            HEAPF32[ptr >> 2] = value;
            break;
        case "double":
            HEAPF64[ptr >> 3] = value;
            break;
        default:
            abort("invalid type for setValue: " + type)
    }
}
var ALLOC_NORMAL = 0;
var ALLOC_STATIC = 2;
var ALLOC_NONE = 4;

function allocate(slab, types, allocator, ptr) {
    var zeroinit, size;
    if (typeof slab === "number") {
        zeroinit = true;
        size = slab
    } else {
        zeroinit = false;
        size = slab.length
    }
    var singleType = typeof types === "string" ? types : null;
    var ret;
    if (allocator == ALLOC_NONE) {
        ret = ptr
    } else {
        ret = [typeof _malloc === "function" ? _malloc : staticAlloc, stackAlloc, staticAlloc, dynamicAlloc][allocator === undefined ? ALLOC_STATIC : allocator](Math.max(size, singleType ? 1 : types.length))
    }
    if (zeroinit) {
        var stop;
        ptr = ret;
        assert((ret & 3) == 0);
        stop = ret + (size & ~3);
        for (; ptr < stop; ptr += 4) {
            HEAP32[ptr >> 2] = 0
        }
        stop = ret + size;
        while (ptr < stop) {
            HEAP8[ptr++ >> 0] = 0
        }
        return ret
    }
    if (singleType === "i8") {
        if (slab.subarray || slab.slice) {
            HEAPU8.set(slab, ret)
        } else {
            HEAPU8.set(new Uint8Array(slab), ret)
        }
        return ret
    }
    var i = 0,
        type, typeSize, previousType;
    while (i < size) {
        var curr = slab[i];
        type = singleType || types[i];
        if (type === 0) {
            i++;
            continue
        }
        if (type == "i64") type = "i32";
        setValue(ret + i, curr, type);
        if (previousType !== type) {
            typeSize = getNativeTypeSize(type);
            previousType = type
        }
        i += typeSize
    }
    return ret
}

function Pointer_stringify(ptr, length) {
    if (length === 0 || !ptr) return "";
    var hasUtf = 0;
    var t;
    var i = 0;
    while (1) {
        t = HEAPU8[ptr + i >> 0];
        hasUtf |= t;
        if (t == 0 && !length) break;
        i++;
        if (length && i == length) break
    }
    if (!length) length = i;
    var ret = "";
    if (hasUtf < 128) {
        var MAX_CHUNK = 1024;
        var curr;
        while (length > 0) {
            curr = String.fromCharCode.apply(String, HEAPU8.subarray(ptr, ptr + Math.min(length, MAX_CHUNK)));
            ret = ret ? ret + curr : curr;
            ptr += MAX_CHUNK;
            length -= MAX_CHUNK
        }
        return ret
    }
    return UTF8ToString(ptr)
}
var UTF8Decoder = typeof TextDecoder !== "undefined" ? new TextDecoder("utf8") : undefined;

function UTF8ArrayToString(u8Array, idx) {
    var endPtr = idx;
    while (u8Array[endPtr]) ++endPtr;
    if (endPtr - idx > 16 && u8Array.subarray && UTF8Decoder) {
        return UTF8Decoder.decode(u8Array.subarray(idx, endPtr))
    } else {
        var u0, u1, u2, u3, u4, u5;
        var str = "";
        while (1) {
            u0 = u8Array[idx++];
            if (!u0) return str;
            if (!(u0 & 128)) {
                str += String.fromCharCode(u0);
                continue
            }
            u1 = u8Array[idx++] & 63;
            if ((u0 & 224) == 192) {
                str += String.fromCharCode((u0 & 31) << 6 | u1);
                continue
            }
            u2 = u8Array[idx++] & 63;
            if ((u0 & 240) == 224) {
                u0 = (u0 & 15) << 12 | u1 << 6 | u2
            } else {
                u3 = u8Array[idx++] & 63;
                if ((u0 & 248) == 240) {
                    u0 = (u0 & 7) << 18 | u1 << 12 | u2 << 6 | u3
                } else {
                    u4 = u8Array[idx++] & 63;
                    if ((u0 & 252) == 248) {
                        u0 = (u0 & 3) << 24 | u1 << 18 | u2 << 12 | u3 << 6 | u4
                    } else {
                        u5 = u8Array[idx++] & 63;
                        u0 = (u0 & 1) << 30 | u1 << 24 | u2 << 18 | u3 << 12 | u4 << 6 | u5
                    }
                }
            }
            if (u0 < 65536) {
                str += String.fromCharCode(u0)
            } else {
                var ch = u0 - 65536;
                str += String.fromCharCode(55296 | ch >> 10, 56320 | ch & 1023)
            }
        }
    }
}

function UTF8ToString(ptr) {
    return UTF8ArrayToString(HEAPU8, ptr)
}

function stringToUTF8Array(str, outU8Array, outIdx, maxBytesToWrite) {
    if (!(maxBytesToWrite > 0)) return 0;
    var startIdx = outIdx;
    var endIdx = outIdx + maxBytesToWrite - 1;
    for (var i = 0; i < str.length; ++i) {
        var u = str.charCodeAt(i);
        if (u >= 55296 && u <= 57343) u = 65536 + ((u & 1023) << 10) | str.charCodeAt(++i) & 1023;
        if (u <= 127) {
            if (outIdx >= endIdx) break;
            outU8Array[outIdx++] = u
        } else if (u <= 2047) {
            if (outIdx + 1 >= endIdx) break;
            outU8Array[outIdx++] = 192 | u >> 6;
            outU8Array[outIdx++] = 128 | u & 63
        } else if (u <= 65535) {
            if (outIdx + 2 >= endIdx) break;
            outU8Array[outIdx++] = 224 | u >> 12;
            outU8Array[outIdx++] = 128 | u >> 6 & 63;
            outU8Array[outIdx++] = 128 | u & 63
        } else if (u <= 2097151) {
            if (outIdx + 3 >= endIdx) break;
            outU8Array[outIdx++] = 240 | u >> 18;
            outU8Array[outIdx++] = 128 | u >> 12 & 63;
            outU8Array[outIdx++] = 128 | u >> 6 & 63;
            outU8Array[outIdx++] = 128 | u & 63
        } else if (u <= 67108863) {
            if (outIdx + 4 >= endIdx) break;
            outU8Array[outIdx++] = 248 | u >> 24;
            outU8Array[outIdx++] = 128 | u >> 18 & 63;
            outU8Array[outIdx++] = 128 | u >> 12 & 63;
            outU8Array[outIdx++] = 128 | u >> 6 & 63;
            outU8Array[outIdx++] = 128 | u & 63
        } else {
            if (outIdx + 5 >= endIdx) break;
            outU8Array[outIdx++] = 252 | u >> 30;
            outU8Array[outIdx++] = 128 | u >> 24 & 63;
            outU8Array[outIdx++] = 128 | u >> 18 & 63;
            outU8Array[outIdx++] = 128 | u >> 12 & 63;
            outU8Array[outIdx++] = 128 | u >> 6 & 63;
            outU8Array[outIdx++] = 128 | u & 63
        }
    }
    outU8Array[outIdx] = 0;
    return outIdx - startIdx
}

function stringToUTF8(str, outPtr, maxBytesToWrite) {
    return stringToUTF8Array(str, HEAPU8, outPtr, maxBytesToWrite)
}

function lengthBytesUTF8(str) {
    var len = 0;
    for (var i = 0; i < str.length; ++i) {
        var u = str.charCodeAt(i);
        if (u >= 55296 && u <= 57343) u = 65536 + ((u & 1023) << 10) | str.charCodeAt(++i) & 1023;
        if (u <= 127) {
            ++len
        } else if (u <= 2047) {
            len += 2
        } else if (u <= 65535) {
            len += 3
        } else if (u <= 2097151) {
            len += 4
        } else if (u <= 67108863) {
            len += 5
        } else {
            len += 6
        }
    }
    return len
}
var UTF16Decoder = typeof TextDecoder !== "undefined" ? new TextDecoder("utf-16le") : undefined;

function allocateUTF8(str) {
    var size = lengthBytesUTF8(str) + 1;
    var ret = _malloc(size);
    if (ret) stringToUTF8Array(str, HEAP8, ret, size);
    return ret
}

function demangle(func) {
    return func
}

function demangleAll(text) {
    var regex = /__Z[\w\d_]+/g;
    return text.replace(regex, (function(x) {
        var y = demangle(x);
        return x === y ? x : x + " [" + y + "]"
    }))
}

function jsStackTrace() {
    var err = new Error;
    if (!err.stack) {
        try {
            throw new Error(0)
        } catch (e) {
            err = e
        }
        if (!err.stack) {
            return "(no stack trace available)"
        }
    }
    return err.stack.toString()
}

function stackTrace() {
    var js = jsStackTrace();
    if (Module["extraStackTrace"]) js += "\n" + Module["extraStackTrace"]();
    return demangleAll(js)
}
var PAGE_SIZE = 16384;
var WASM_PAGE_SIZE = 65536;
var ASMJS_PAGE_SIZE = 16777216;

function alignUp(x, multiple) {
    if (x % multiple > 0) {
        x += multiple - x % multiple
    }
    return x
}
var buffer, HEAP8, HEAPU8, HEAP16, HEAPU16, HEAP32, HEAPU32, HEAPF32, HEAPF64;

function updateGlobalBuffer(buf) {
    Module["buffer"] = buffer = buf
}

function updateGlobalBufferViews() {
    Module["HEAP8"] = HEAP8 = new Int8Array(buffer);
    Module["HEAP16"] = HEAP16 = new Int16Array(buffer);
    Module["HEAP32"] = HEAP32 = new Int32Array(buffer);
    Module["HEAPU8"] = HEAPU8 = new Uint8Array(buffer);
    Module["HEAPU16"] = HEAPU16 = new Uint16Array(buffer);
    Module["HEAPU32"] = HEAPU32 = new Uint32Array(buffer);
    Module["HEAPF32"] = HEAPF32 = new Float32Array(buffer);
    Module["HEAPF64"] = HEAPF64 = new Float64Array(buffer)
}
var STATIC_BASE, STATICTOP, staticSealed;
var STACK_BASE, STACKTOP, STACK_MAX;
var DYNAMIC_BASE, DYNAMICTOP_PTR;
STATIC_BASE = STATICTOP = STACK_BASE = STACKTOP = STACK_MAX = DYNAMIC_BASE = DYNAMICTOP_PTR = 0;
staticSealed = false;

function abortOnCannotGrowMemory() {
    abort("Cannot enlarge memory arrays. Either (1) compile with  -s TOTAL_MEMORY=X  with X higher than the current value " + TOTAL_MEMORY + ", (2) compile with  -s ALLOW_MEMORY_GROWTH=1  which allows increasing the size at runtime, or (3) if you want malloc to return NULL (0) instead of this abort, compile with  -s ABORTING_MALLOC=0 ")
}

function enlargeMemory() {
    abortOnCannotGrowMemory()
}
var TOTAL_STACK = Module["TOTAL_STACK"] || 5242880;
var TOTAL_MEMORY = Module["TOTAL_MEMORY"] || 536870912;
if (TOTAL_MEMORY < TOTAL_STACK) Module.printErr("TOTAL_MEMORY should be larger than TOTAL_STACK, was " + TOTAL_MEMORY + "! (TOTAL_STACK=" + TOTAL_STACK + ")");
if (Module["buffer"]) {
    buffer = Module["buffer"]
} else {
    if (typeof WebAssembly === "object" && typeof WebAssembly.Memory === "function") {
        Module["wasmMemory"] = new WebAssembly.Memory({
            "initial": TOTAL_MEMORY / WASM_PAGE_SIZE,
            "maximum": TOTAL_MEMORY / WASM_PAGE_SIZE
        });
        buffer = Module["wasmMemory"].buffer
    } else {
        buffer = new ArrayBuffer(TOTAL_MEMORY)
    }
    Module["buffer"] = buffer
}
updateGlobalBufferViews();

function getTotalMemory() {
    return TOTAL_MEMORY
}
HEAP32[0] = 1668509029;
HEAP16[1] = 25459;
if (HEAPU8[2] !== 115 || HEAPU8[3] !== 99) throw "Runtime error: expected the system to be little-endian!";

function callRuntimeCallbacks(callbacks) {
    while (callbacks.length > 0) {
        var callback = callbacks.shift();
        if (typeof callback == "function") {
            callback();
            continue
        }
        var func = callback.func;
        if (typeof func === "number") {
            if (callback.arg === undefined) {
                Module["dynCall_v"](func)
            } else {
                Module["dynCall_vi"](func, callback.arg)
            }
        } else {
            func(callback.arg === undefined ? null : callback.arg)
        }
    }
}
var __ATPRERUN__ = [];
var __ATINIT__ = [];
var __ATMAIN__ = [];
var __ATEXIT__ = [];
var __ATPOSTRUN__ = [];
var runtimeInitialized = false;
var runtimeExited = false;

function preRun() {
    if (Module["preRun"]) {
        if (typeof Module["preRun"] == "function") Module["preRun"] = [Module["preRun"]];
        while (Module["preRun"].length) {
            addOnPreRun(Module["preRun"].shift())
        }
    }
    callRuntimeCallbacks(__ATPRERUN__)
}

function ensureInitRuntime() {
    if (runtimeInitialized) return;
    runtimeInitialized = true;
    callRuntimeCallbacks(__ATINIT__)
}

function preMain() {
    callRuntimeCallbacks(__ATMAIN__)
}

function exitRuntime() {
    callRuntimeCallbacks(__ATEXIT__);
    runtimeExited = true
}

function postRun() {
    if (Module["postRun"]) {
        if (typeof Module["postRun"] == "function") Module["postRun"] = [Module["postRun"]];
        while (Module["postRun"].length) {
            addOnPostRun(Module["postRun"].shift())
        }
    }
    callRuntimeCallbacks(__ATPOSTRUN__)
}

function addOnPreRun(cb) {
    __ATPRERUN__.unshift(cb)
}

function addOnPostRun(cb) {
    __ATPOSTRUN__.unshift(cb)
}

function writeArrayToMemory(array, buffer) {
    HEAP8.set(array, buffer)
}

function writeAsciiToMemory(str, buffer, dontAddNull) {
    for (var i = 0; i < str.length; ++i) {
        HEAP8[buffer++ >> 0] = str.charCodeAt(i)
    }
    if (!dontAddNull) HEAP8[buffer >> 0] = 0
}
var Math_abs = Math.abs;
var Math_cos = Math.cos;
var Math_sin = Math.sin;
var Math_tan = Math.tan;
var Math_acos = Math.acos;
var Math_asin = Math.asin;
var Math_atan = Math.atan;
var Math_atan2 = Math.atan2;
var Math_exp = Math.exp;
var Math_log = Math.log;
var Math_sqrt = Math.sqrt;
var Math_ceil = Math.ceil;
var Math_floor = Math.floor;
var Math_pow = Math.pow;
var Math_imul = Math.imul;
var Math_fround = Math.fround;
var Math_round = Math.round;
var Math_min = Math.min;
var Math_max = Math.max;
var Math_clz32 = Math.clz32;
var Math_trunc = Math.trunc;
var runDependencies = 0;
var runDependencyWatcher = null;
var dependenciesFulfilled = null;

function getUniqueRunDependency(id) {
    return id
}

function addRunDependency(id) {
    runDependencies++;
    if (Module["monitorRunDependencies"]) {
        Module["monitorRunDependencies"](runDependencies)
    }
}

function removeRunDependency(id) {
    runDependencies--;
    if (Module["monitorRunDependencies"]) {
        Module["monitorRunDependencies"](runDependencies)
    }
    if (runDependencies == 0) {
        if (runDependencyWatcher !== null) {
            clearInterval(runDependencyWatcher);
            runDependencyWatcher = null
        }
        if (dependenciesFulfilled) {
            var callback = dependenciesFulfilled;
            dependenciesFulfilled = null;
            callback()
        }
    }
}
Module["preloadedImages"] = {};
Module["preloadedAudios"] = {};
var dataURIPrefix = "data:application/octet-stream;base64,";

function isDataURI(filename) {
    return String.prototype.startsWith ? filename.startsWith(dataURIPrefix) : filename.indexOf(dataURIPrefix) === 0
}

function integrateWasmJS() {
    var wasmTextFile = "mednafen_snes_libretro.wast";
    var wasmBinaryFile = "mednafen_snes_libretro.wasm";
    var asmjsCodeFile = "mednafen_snes_libretro.temp.asm.js";
    if (typeof Module["locateFile"] === "function") {
        if (!isDataURI(wasmTextFile)) {
            wasmTextFile = Module["locateFile"](wasmTextFile)
        }
        if (!isDataURI(wasmBinaryFile)) {
            wasmBinaryFile = Module["locateFile"](wasmBinaryFile)
        }
        if (!isDataURI(asmjsCodeFile)) {
            asmjsCodeFile = Module["locateFile"](asmjsCodeFile)
        }
    }
    var wasmPageSize = 64 * 1024;
    var info = {
        "global": null,
        "env": null,
        "asm2wasm": {
            "f64-rem": (function(x, y) {
                return x % y
            }),
            "debugger": (function() {
                debugger
            })
        },
        "parent": Module
    };
    var exports = null;

    function mergeMemory(newBuffer) {
        var oldBuffer = Module["buffer"];
        if (newBuffer.byteLength < oldBuffer.byteLength) {
            Module["printErr"]("the new buffer in mergeMemory is smaller than the previous one. in native wasm, we should grow memory here")
        }
        var oldView = new Int8Array(oldBuffer);
        var newView = new Int8Array(newBuffer);
        newView.set(oldView);
        updateGlobalBuffer(newBuffer);
        updateGlobalBufferViews()
    }

    function fixImports(imports) {
        return imports
    }

    function getBinary() {
        try {
            if (Module["wasmBinary"]) {
                return new Uint8Array(Module["wasmBinary"])
            }
            if (Module["readBinary"]) {
                return Module["readBinary"](wasmBinaryFile)
            } else {
                throw "on the web, we need the wasm binary to be preloaded and set on Module['wasmBinary']. emcc.py will do that for you when generating HTML (but not JS)"
            }
        } catch (err) {
            abort(err)
        }
    }

    function getBinaryPromise() {
        if (!Module["wasmBinary"] && (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) && typeof fetch === "function") {
            return fetch(wasmBinaryFile, {
                credentials: "same-origin"
            }).then((function(response) {
                if (!response["ok"]) {
                    throw "failed to load wasm binary file at '" + wasmBinaryFile + "'"
                }
                return response["arrayBuffer"]()
            })).catch((function() {
                return getBinary()
            }))
        }
        return new Promise((function(resolve, reject) {
            resolve(getBinary())
        }))
    }

    function doNativeWasm(global, env, providedBuffer) {
        if (typeof WebAssembly !== "object") {
            Module["printErr"]("no native wasm support detected");
            return false
        }
        if (!(Module["wasmMemory"] instanceof WebAssembly.Memory)) {
            Module["printErr"]("no native wasm Memory in use");
            return false
        }
        env["memory"] = Module["wasmMemory"];
        info["global"] = {
            "NaN": NaN,
            "Infinity": Infinity
        };
        info["global.Math"] = Math;
        info["env"] = env;

        function receiveInstance(instance, module) {
            exports = instance.exports;
            if (exports.memory) mergeMemory(exports.memory);
            Module["asm"] = exports;
            Module["usingWasm"] = true;
            removeRunDependency("wasm-instantiate")
        }
        addRunDependency("wasm-instantiate");
        if (Module["instantiateWasm"]) {
            try {
                return Module["instantiateWasm"](info, receiveInstance)
            } catch (e) {
                Module["printErr"]("Module.instantiateWasm callback failed with error: " + e);
                return false
            }
        }

        function receiveInstantiatedSource(output) {
            receiveInstance(output["instance"], output["module"])
        }

        function instantiateArrayBuffer(receiver) {
            getBinaryPromise().then((function(binary) {
                return WebAssembly.instantiate(binary, info)
            })).then(receiver).catch((function(reason) {
                Module["printErr"]("failed to asynchronously prepare wasm: " + reason);
                abort(reason)
            }))
        }
        if (!Module["wasmBinary"] && typeof WebAssembly.instantiateStreaming === "function" && !isDataURI(wasmBinaryFile) && typeof fetch === "function") {
            WebAssembly.instantiateStreaming(fetch(wasmBinaryFile, {
                credentials: "same-origin"
            }), info).then(receiveInstantiatedSource).catch((function(reason) {
                Module["printErr"]("wasm streaming compile failed: " + reason);
                Module["printErr"]("falling back to ArrayBuffer instantiation");
                instantiateArrayBuffer(receiveInstantiatedSource)
            }))
        } else {
            instantiateArrayBuffer(receiveInstantiatedSource)
        }
        return {}
    }
    Module["asmPreload"] = Module["asm"];
    var asmjsReallocBuffer = Module["reallocBuffer"];
    var wasmReallocBuffer = (function(size) {
        var PAGE_MULTIPLE = Module["usingWasm"] ? WASM_PAGE_SIZE : ASMJS_PAGE_SIZE;
        size = alignUp(size, PAGE_MULTIPLE);
        var old = Module["buffer"];
        var oldSize = old.byteLength;
        if (Module["usingWasm"]) {
            try {
                var result = Module["wasmMemory"].grow((size - oldSize) / wasmPageSize);
                if (result !== (-1 | 0)) {
                    return Module["buffer"] = Module["wasmMemory"].buffer
                } else {
                    return null
                }
            } catch (e) {
                return null
            }
        }
    });
    Module["reallocBuffer"] = (function(size) {
        if (finalMethod === "asmjs") {
            return asmjsReallocBuffer(size)
        } else {
            return wasmReallocBuffer(size)
        }
    });
    var finalMethod = "";
    Module["asm"] = (function(global, env, providedBuffer) {
        env = fixImports(env);
        if (!env["table"]) {
            var TABLE_SIZE = Module["wasmTableSize"];
            if (TABLE_SIZE === undefined) TABLE_SIZE = 1024;
            var MAX_TABLE_SIZE = Module["wasmMaxTableSize"];
            if (typeof WebAssembly === "object" && typeof WebAssembly.Table === "function") {
                if (MAX_TABLE_SIZE !== undefined) {
                    env["table"] = new WebAssembly.Table({
                        "initial": TABLE_SIZE,
                        "maximum": MAX_TABLE_SIZE,
                        "element": "anyfunc"
                    })
                } else {
                    env["table"] = new WebAssembly.Table({
                        "initial": TABLE_SIZE,
                        element: "anyfunc"
                    })
                }
            } else {
                env["table"] = new Array(TABLE_SIZE)
            }
            Module["wasmTable"] = env["table"]
        }
        if (!env["memoryBase"]) {
            env["memoryBase"] = Module["STATIC_BASE"]
        }
        if (!env["tableBase"]) {
            env["tableBase"] = 0
        }
        var exports;
        exports = doNativeWasm(global, env, providedBuffer);
        if (!exports) abort("no binaryen method succeeded. consider enabling more options, like interpreting, if you want that: https://github.com/kripken/emscripten/wiki/WebAssembly#binaryen-methods");
        return exports
    });
}
integrateWasmJS();
var ASM_CONSTS = [(function($0, $1) {
    Module.printErr("bad name in getProcAddress: " + [Pointer_stringify($0), Pointer_stringify($1)])
})];

function _emscripten_asm_const_iii(code, a0, a1) {
    return ASM_CONSTS[code](a0, a1)
}
STATIC_BASE = GLOBAL_BASE;
STATICTOP = STATIC_BASE + 6007488;
__ATINIT__.push({
    func: (function() {
        __GLOBAL__sub_I_libretro_cpp()
    })
}, {
    func: (function() {
        __GLOBAL__sub_I_mempatcher_cpp()
    })
}, {
    func: (function() {
        __GLOBAL__sub_I_interface_cpp()
    })
}, {
    func: (function() {
        __GLOBAL__sub_I_cartridge_cpp()
    })
}, {
    func: (function() {
        __GLOBAL__sub_I_21fx_cpp()
    })
}, {
    func: (function() {
        __GLOBAL__sub_I_memory_cpp()
    })
}, {
    func: (function() {
        __GLOBAL__sub_I_system_cpp()
    })
}, {
    func: (function() {
        __GLOBAL__sub_I_cheat_cpp()
    })
}, {
    func: (function() {
        __GLOBAL__sub_I_sa1_cpp()
    })
}, {
    func: (function() {
        __GLOBAL__sub_I_spc7110_cpp()
    })
}, {
    func: (function() {
        __GLOBAL__sub_I_superfx_cpp()
    })
}, {
    func: (function() {
        __GLOBAL__sub_I_scpu_cpp()
    })
}, {
    func: (function() {
        __GLOBAL__sub_I_sdsp_cpp()
    })
}, {
    func: (function() {
        __GLOBAL__sub_I_bppu_cpp()
    })
}, {
    func: (function() {
        __GLOBAL__sub_I_ssmp_cpp()
    })
});
var STATIC_BUMP = 6007488;
Module["STATIC_BASE"] = STATIC_BASE;
Module["STATIC_BUMP"] = STATIC_BUMP;
var tempDoublePtr = STATICTOP;
STATICTOP += 16;

function _emscripten_set_main_loop_timing(mode, value) {
    Browser.mainLoop.timingMode = mode;
    Browser.mainLoop.timingValue = value;
    if (!Browser.mainLoop.func) {
        return 1
    }
    if (mode == 0) {
        Browser.mainLoop.scheduler = function Browser_mainLoop_scheduler_setTimeout() {
            var timeUntilNextTick = Math.max(0, Browser.mainLoop.tickStartTime + value - _emscripten_get_now()) | 0;
            setTimeout(Browser.mainLoop.runner, timeUntilNextTick)
        };
        Browser.mainLoop.method = "timeout"
    } else if (mode == 1) {
        Browser.mainLoop.scheduler = function Browser_mainLoop_scheduler_rAF() {
            Browser.requestAnimationFrame(Browser.mainLoop.runner)
        };
        Browser.mainLoop.method = "rAF"
    } else if (mode == 2) {
        if (typeof setImmediate === "undefined") {
            var setImmediates = [];
            var emscriptenMainLoopMessageId = "setimmediate";

            function Browser_setImmediate_messageHandler(event) {
                if (event.data === emscriptenMainLoopMessageId || event.data.target === emscriptenMainLoopMessageId) {
                    event.stopPropagation();
                    setImmediates.shift()()
                }
            }
            addEventListener("message", Browser_setImmediate_messageHandler, true);
            setImmediate = function Browser_emulated_setImmediate(func) {
                setImmediates.push(func);
                if (ENVIRONMENT_IS_WORKER) {
                    if (Module["setImmediates"] === undefined) Module["setImmediates"] = [];
                    Module["setImmediates"].push(func);
                    postMessage({
                        target: emscriptenMainLoopMessageId
                    })
                } else postMessage(emscriptenMainLoopMessageId, "*")
            }
        }
        Browser.mainLoop.scheduler = function Browser_mainLoop_scheduler_setImmediate() {
            setImmediate(Browser.mainLoop.runner)
        };
        Browser.mainLoop.method = "immediate"
    }
    return 0
}

function _emscripten_get_now() {
    abort()
}

function _emscripten_set_main_loop(func, fps, simulateInfiniteLoop, arg, noSetTiming) {
    Module["noExitRuntime"] = true;
    assert(!Browser.mainLoop.func, "emscripten_set_main_loop: there can only be one main loop function at once: call emscripten_cancel_main_loop to cancel the previous one before setting a new one with different parameters.");
    Browser.mainLoop.func = func;
    Browser.mainLoop.arg = arg;
    var browserIterationFunc;
    if (typeof arg !== "undefined") {
        browserIterationFunc = (function() {
            Module["dynCall_vi"](func, arg)
        })
    } else {
        browserIterationFunc = (function() {
            Module["dynCall_v"](func)
        })
    }
    var thisMainLoopId = Browser.mainLoop.currentlyRunningMainloop;
    Browser.mainLoop.runner = function Browser_mainLoop_runner() {
        if (ABORT) return;
        if (Browser.mainLoop.queue.length > 0) {
            var start = Date.now();
            var blocker = Browser.mainLoop.queue.shift();
            blocker.func(blocker.arg);
            if (Browser.mainLoop.remainingBlockers) {
                var remaining = Browser.mainLoop.remainingBlockers;
                var next = remaining % 1 == 0 ? remaining - 1 : Math.floor(remaining);
                if (blocker.counted) {
                    Browser.mainLoop.remainingBlockers = next
                } else {
                    next = next + .5;
                    Browser.mainLoop.remainingBlockers = (8 * remaining + next) / 9
                }
            }
            console.log('main loop blocker "' + blocker.name + '" took ' + (Date.now() - start) + " ms");
            Browser.mainLoop.updateStatus();
            if (thisMainLoopId < Browser.mainLoop.currentlyRunningMainloop) return;
            setTimeout(Browser.mainLoop.runner, 0);
            return
        }
        if (thisMainLoopId < Browser.mainLoop.currentlyRunningMainloop) return;
        Browser.mainLoop.currentFrameNumber = Browser.mainLoop.currentFrameNumber + 1 | 0;
        if (Browser.mainLoop.timingMode == 1 && Browser.mainLoop.timingValue > 1 && Browser.mainLoop.currentFrameNumber % Browser.mainLoop.timingValue != 0) {
            Browser.mainLoop.scheduler();
            return
        } else if (Browser.mainLoop.timingMode == 0) {
            Browser.mainLoop.tickStartTime = _emscripten_get_now()
        }
        GL.newRenderingFrameStarted();
        if (Browser.mainLoop.method === "timeout" && Module.ctx) {
            Module.printErr("Looks like you are rendering without using requestAnimationFrame for the main loop. You should use 0 for the frame rate in emscripten_set_main_loop in order to use requestAnimationFrame, as that can greatly improve your frame rates!");
            Browser.mainLoop.method = ""
        }
        Browser.mainLoop.runIter(browserIterationFunc);
        if (thisMainLoopId < Browser.mainLoop.currentlyRunningMainloop) return;
        if (typeof SDL === "object" && SDL.audio && SDL.audio.queueNewAudioData) SDL.audio.queueNewAudioData();
        Browser.mainLoop.scheduler()
    };
    if (!noSetTiming) {
        if (fps && fps > 0) _emscripten_set_main_loop_timing(0, 1e3 / fps);
        else _emscripten_set_main_loop_timing(1, 1);
        Browser.mainLoop.scheduler()
    }
    if (simulateInfiniteLoop) {
        throw "SimulateInfiniteLoop"
    }
}
var Browser = {
    mainLoop: {
        scheduler: null,
        method: "",
        currentlyRunningMainloop: 0,
        func: null,
        arg: 0,
        timingMode: 0,
        timingValue: 0,
        currentFrameNumber: 0,
        queue: [],
        pause: (function() {
            Browser.mainLoop.scheduler = null;
            Browser.mainLoop.currentlyRunningMainloop++
        }),
        resume: (function() {
            Browser.mainLoop.currentlyRunningMainloop++;
            var timingMode = Browser.mainLoop.timingMode;
            var timingValue = Browser.mainLoop.timingValue;
            var func = Browser.mainLoop.func;
            Browser.mainLoop.func = null;
            _emscripten_set_main_loop(func, 0, false, Browser.mainLoop.arg, true);
            _emscripten_set_main_loop_timing(timingMode, timingValue);
            Browser.mainLoop.scheduler()
        }),
        updateStatus: (function() {
            if (Module["setStatus"]) {
                var message = Module["statusMessage"] || "Please wait...";
                var remaining = Browser.mainLoop.remainingBlockers;
                var expected = Browser.mainLoop.expectedBlockers;
                if (remaining) {
                    if (remaining < expected) {
                        Module["setStatus"](message + " (" + (expected - remaining) + "/" + expected + ")")
                    } else {
                        Module["setStatus"](message)
                    }
                } else {
                    Module["setStatus"]("")
                }
            }
        }),
        runIter: (function(func) {
            if (ABORT) return;
            if (Module["preMainLoop"]) {
                var preRet = Module["preMainLoop"]();
                if (preRet === false) {
                    return
                }
            }
            try {
                func()
            } catch (e) {
                if (e instanceof ExitStatus) {
                    return
                } else {
                    if (e && typeof e === "object" && e.stack) Module.printErr("exception thrown: " + [e, e.stack]);
                    throw e
                }
            }
            if (Module["postMainLoop"]) Module["postMainLoop"]()
        })
    },
    isFullscreen: false,
    pointerLock: false,
    moduleContextCreatedCallbacks: [],
    workers: [],
    init: (function() {
        if (!Module["preloadPlugins"]) Module["preloadPlugins"] = [];
        if (Browser.initted) return;
        Browser.initted = true;
        try {
            new Blob;
            Browser.hasBlobConstructor = true
        } catch (e) {
            Browser.hasBlobConstructor = false;
            console.log("warning: no blob constructor, cannot create blobs with mimetypes")
        }
        Browser.BlobBuilder = typeof MozBlobBuilder != "undefined" ? MozBlobBuilder : typeof WebKitBlobBuilder != "undefined" ? WebKitBlobBuilder : !Browser.hasBlobConstructor ? console.log("warning: no BlobBuilder") : null;
        Browser.URLObject = typeof window != "undefined" ? window.URL ? window.URL : window.webkitURL : undefined;
        if (!Module.noImageDecoding && typeof Browser.URLObject === "undefined") {
            console.log("warning: Browser does not support creating object URLs. Built-in browser image decoding will not be available.");
            Module.noImageDecoding = true
        }
        var imagePlugin = {};
        imagePlugin["canHandle"] = function imagePlugin_canHandle(name) {
            return !Module.noImageDecoding && /\.(jpg|jpeg|png|bmp)$/i.test(name)
        };
        imagePlugin["handle"] = function imagePlugin_handle(byteArray, name, onload, onerror) {
            var b = null;
            if (Browser.hasBlobConstructor) {
                try {
                    b = new Blob([byteArray], {
                        type: Browser.getMimetype(name)
                    });
                    if (b.size !== byteArray.length) {
                        b = new Blob([(new Uint8Array(byteArray)).buffer], {
                            type: Browser.getMimetype(name)
                        })
                    }
                } catch (e) {
                    warnOnce("Blob constructor present but fails: " + e + "; falling back to blob builder")
                }
            }
            if (!b) {
                var bb = new Browser.BlobBuilder;
                bb.append((new Uint8Array(byteArray)).buffer);
                b = bb.getBlob()
            }
            var url = Browser.URLObject.createObjectURL(b);
            var img = new Image;
            img.onload = function img_onload() {
                assert(img.complete, "Image " + name + " could not be decoded");
                var canvas = document.createElement("canvas");
                canvas.width = img.width;
                canvas.height = img.height;
                var ctx = canvas.getContext("2d");
                ctx.drawImage(img, 0, 0);
                Module["preloadedImages"][name] = canvas;
                Browser.URLObject.revokeObjectURL(url);
                if (onload) onload(byteArray)
            };
            img.onerror = function img_onerror(event) {
                console.log("Image " + url + " could not be decoded");
                if (onerror) onerror()
            };
            img.src = url
        };
        Module["preloadPlugins"].push(imagePlugin);
        var audioPlugin = {};
        audioPlugin["canHandle"] = function audioPlugin_canHandle(name) {
            return !Module.noAudioDecoding && name.substr(-4) in {
                ".ogg": 1,
                ".wav": 1,
                ".mp3": 1
            }
        };
        audioPlugin["handle"] = function audioPlugin_handle(byteArray, name, onload, onerror) {
            var done = false;

            function finish(audio) {
                if (done) return;
                done = true;
                Module["preloadedAudios"][name] = audio;
                if (onload) onload(byteArray)
            }

            function fail() {
                if (done) return;
                done = true;
                Module["preloadedAudios"][name] = new Audio;
                if (onerror) onerror()
            }
            if (Browser.hasBlobConstructor) {
                try {
                    var b = new Blob([byteArray], {
                        type: Browser.getMimetype(name)
                    })
                } catch (e) {
                    return fail()
                }
                var url = Browser.URLObject.createObjectURL(b);
                var audio = new Audio;
                audio.addEventListener("canplaythrough", (function() {
                    finish(audio)
                }), false);
                audio.onerror = function audio_onerror(event) {
                    if (done) return;
                    console.log("warning: browser could not fully decode audio " + name + ", trying slower base64 approach");

                    function encode64(data) {
                        var BASE = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
                        var PAD = "=";
                        var ret = "";
                        var leftchar = 0;
                        var leftbits = 0;
                        for (var i = 0; i < data.length; i++) {
                            leftchar = leftchar << 8 | data[i];
                            leftbits += 8;
                            while (leftbits >= 6) {
                                var curr = leftchar >> leftbits - 6 & 63;
                                leftbits -= 6;
                                ret += BASE[curr]
                            }
                        }
                        if (leftbits == 2) {
                            ret += BASE[(leftchar & 3) << 4];
                            ret += PAD + PAD
                        } else if (leftbits == 4) {
                            ret += BASE[(leftchar & 15) << 2];
                            ret += PAD
                        }
                        return ret
                    }
                    audio.src = "data:audio/x-" + name.substr(-3) + ";base64," + encode64(byteArray);
                    finish(audio)
                };
                audio.src = url;
                Browser.safeSetTimeout((function() {
                    finish(audio)
                }), 1e4)
            } else {
                return fail()
            }
        };
        Module["preloadPlugins"].push(audioPlugin);

        function pointerLockChange() {
            Browser.pointerLock = document["pointerLockElement"] === Module["canvas"] || document["mozPointerLockElement"] === Module["canvas"] || document["webkitPointerLockElement"] === Module["canvas"] || document["msPointerLockElement"] === Module["canvas"]
        }
        var canvas = Module["canvas"];
        if (canvas) {
            canvas.requestPointerLock = canvas["requestPointerLock"] || canvas["mozRequestPointerLock"] || canvas["webkitRequestPointerLock"] || canvas["msRequestPointerLock"] || (function() {});
            canvas.exitPointerLock = document["exitPointerLock"] || document["mozExitPointerLock"] || document["webkitExitPointerLock"] || document["msExitPointerLock"] || (function() {});
            canvas.exitPointerLock = canvas.exitPointerLock.bind(document);
            document.addEventListener("pointerlockchange", pointerLockChange, false);
            document.addEventListener("mozpointerlockchange", pointerLockChange, false);
            document.addEventListener("webkitpointerlockchange", pointerLockChange, false);
            document.addEventListener("mspointerlockchange", pointerLockChange, false);
            if (Module["elementPointerLock"]) {
                canvas.addEventListener("click", (function(ev) {
                    if (!Browser.pointerLock && Module["canvas"].requestPointerLock) {
                        Module["canvas"].requestPointerLock();
                        ev.preventDefault()
                    }
                }), false)
            }
        }
    }),
    createContext: (function(canvas, useWebGL, setInModule, webGLContextAttributes) {
        if (useWebGL && Module.ctx && canvas == Module.canvas) return Module.ctx;
        var ctx;
        var contextHandle;
        if (useWebGL) {
            var contextAttributes = {
                antialias: false,
                alpha: false
            };
            if (webGLContextAttributes) {
                for (var attribute in webGLContextAttributes) {
                    contextAttributes[attribute] = webGLContextAttributes[attribute]
                }
            }
            contextHandle = GL.createContext(canvas, contextAttributes);
            if (contextHandle) {
                ctx = GL.getContext(contextHandle).GLctx
            }
        } else {
            ctx = canvas.getContext("2d")
        }
        if (!ctx) return null;
        if (setInModule) {
            if (!useWebGL) assert(typeof GLctx === "undefined", "cannot set in module if GLctx is used, but we are a non-GL context that would replace it");
            Module.ctx = ctx;
            if (useWebGL) GL.makeContextCurrent(contextHandle);
            Module.useWebGL = useWebGL;
            Browser.moduleContextCreatedCallbacks.forEach((function(callback) {
                callback()
            }));
            Browser.init()
        }
        return ctx
    }),
    destroyContext: (function(canvas, useWebGL, setInModule) {}),
    fullscreenHandlersInstalled: false,
    lockPointer: undefined,
    resizeCanvas: undefined,
    requestFullscreen: (function(lockPointer, resizeCanvas, vrDevice) {
        Browser.lockPointer = lockPointer;
        Browser.resizeCanvas = resizeCanvas;
        Browser.vrDevice = vrDevice;
        if (typeof Browser.lockPointer === "undefined") Browser.lockPointer = true;
        if (typeof Browser.resizeCanvas === "undefined") Browser.resizeCanvas = false;
        if (typeof Browser.vrDevice === "undefined") Browser.vrDevice = null;
        var canvas = Module["canvas"];

        function fullscreenChange() {
            Browser.isFullscreen = false;
            var canvasContainer = canvas.parentNode;
            if ((document["fullscreenElement"] || document["mozFullScreenElement"] || document["msFullscreenElement"] || document["webkitFullscreenElement"] || document["webkitCurrentFullScreenElement"]) === canvasContainer) {
                canvas.exitFullscreen = document["exitFullscreen"] || document["cancelFullScreen"] || document["mozCancelFullScreen"] || document["msExitFullscreen"] || document["webkitCancelFullScreen"] || (function() {});
                canvas.exitFullscreen = canvas.exitFullscreen.bind(document);
                if (Browser.lockPointer) canvas.requestPointerLock();
                Browser.isFullscreen = true;
                if (Browser.resizeCanvas) Browser.setFullscreenCanvasSize()
            } else {
                canvasContainer.parentNode.insertBefore(canvas, canvasContainer);
                canvasContainer.parentNode.removeChild(canvasContainer);
                if (Browser.resizeCanvas) Browser.setWindowedCanvasSize()
            }
            if (Module["onFullScreen"]) Module["onFullScreen"](Browser.isFullscreen);
            if (Module["onFullscreen"]) Module["onFullscreen"](Browser.isFullscreen);
            Browser.updateCanvasDimensions(canvas)
        }
        if (!Browser.fullscreenHandlersInstalled) {
            Browser.fullscreenHandlersInstalled = true;
            document.addEventListener("fullscreenchange", fullscreenChange, false);
            document.addEventListener("mozfullscreenchange", fullscreenChange, false);
            document.addEventListener("webkitfullscreenchange", fullscreenChange, false);
            document.addEventListener("MSFullscreenChange", fullscreenChange, false)
        }
        var canvasContainer = document.createElement("div");
        canvas.parentNode.insertBefore(canvasContainer, canvas);
        canvasContainer.appendChild(canvas);
        canvasContainer.requestFullscreen = canvasContainer["requestFullscreen"] || canvasContainer["mozRequestFullScreen"] || canvasContainer["msRequestFullscreen"] || (canvasContainer["webkitRequestFullscreen"] ? (function() {
            canvasContainer["webkitRequestFullscreen"](Element["ALLOW_KEYBOARD_INPUT"])
        }) : null) || (canvasContainer["webkitRequestFullScreen"] ? (function() {
            canvasContainer["webkitRequestFullScreen"](Element["ALLOW_KEYBOARD_INPUT"])
        }) : null);
        if (vrDevice) {
            canvasContainer.requestFullscreen({
                vrDisplay: vrDevice
            })
        } else {
            canvasContainer.requestFullscreen()
        }
    }),
    requestFullScreen: (function(lockPointer, resizeCanvas, vrDevice) {
        Module.printErr("Browser.requestFullScreen() is deprecated. Please call Browser.requestFullscreen instead.");
        Browser.requestFullScreen = (function(lockPointer, resizeCanvas, vrDevice) {
            return Browser.requestFullscreen(lockPointer, resizeCanvas, vrDevice)
        });
        return Browser.requestFullscreen(lockPointer, resizeCanvas, vrDevice)
    }),
    nextRAF: 0,
    fakeRequestAnimationFrame: (function(func) {
        var now = Date.now();
        if (Browser.nextRAF === 0) {
            Browser.nextRAF = now + 1e3 / 60
        } else {
            while (now + 2 >= Browser.nextRAF) {
                Browser.nextRAF += 1e3 / 60
            }
        }
        var delay = Math.max(Browser.nextRAF - now, 0);
        setTimeout(func, delay)
    }),
    requestAnimationFrame: function requestAnimationFrame(func) {
        if (typeof window === "undefined") {
            Browser.fakeRequestAnimationFrame(func)
        } else {
            if (!window.requestAnimationFrame) {
                window.requestAnimationFrame = window["requestAnimationFrame"] || window["mozRequestAnimationFrame"] || window["webkitRequestAnimationFrame"] || window["msRequestAnimationFrame"] || window["oRequestAnimationFrame"] || Browser.fakeRequestAnimationFrame
            }
            window.requestAnimationFrame(func)
        }
    },
    safeCallback: (function(func) {
        return (function() {
            if (!ABORT) return func.apply(null, arguments)
        })
    }),
    allowAsyncCallbacks: true,
    queuedAsyncCallbacks: [],
    pauseAsyncCallbacks: (function() {
        Browser.allowAsyncCallbacks = false
    }),
    resumeAsyncCallbacks: (function() {
        Browser.allowAsyncCallbacks = true;
        if (Browser.queuedAsyncCallbacks.length > 0) {
            var callbacks = Browser.queuedAsyncCallbacks;
            Browser.queuedAsyncCallbacks = [];
            callbacks.forEach((function(func) {
                func()
            }))
        }
    }),
    safeRequestAnimationFrame: (function(func) {
        return Browser.requestAnimationFrame((function() {
            if (ABORT) return;
            if (Browser.allowAsyncCallbacks) {
                func()
            } else {
                Browser.queuedAsyncCallbacks.push(func)
            }
        }))
    }),
    safeSetTimeout: (function(func, timeout) {
        Module["noExitRuntime"] = true;
        return setTimeout((function() {
            if (ABORT) return;
            if (Browser.allowAsyncCallbacks) {
                func()
            } else {
                Browser.queuedAsyncCallbacks.push(func)
            }
        }), timeout)
    }),
    safeSetInterval: (function(func, timeout) {
        Module["noExitRuntime"] = true;
        return setInterval((function() {
            if (ABORT) return;
            if (Browser.allowAsyncCallbacks) {
                func()
            }
        }), timeout)
    }),
    getMimetype: (function(name) {
        return {
            "jpg": "image/jpeg",
            "jpeg": "image/jpeg",
            "png": "image/png",
            "bmp": "image/bmp",
            "ogg": "audio/ogg",
            "wav": "audio/wav",
            "mp3": "audio/mpeg"
        }[name.substr(name.lastIndexOf(".") + 1)]
    }),
    getUserMedia: (function(func) {
        if (!window.getUserMedia) {
            window.getUserMedia = navigator["getUserMedia"] || navigator["mozGetUserMedia"]
        }
        window.getUserMedia(func)
    }),
    getMovementX: (function(event) {
        return event["movementX"] || event["mozMovementX"] || event["webkitMovementX"] || 0
    }),
    getMovementY: (function(event) {
        return event["movementY"] || event["mozMovementY"] || event["webkitMovementY"] || 0
    }),
    getMouseWheelDelta: (function(event) {
        var delta = 0;
        switch (event.type) {
            case "DOMMouseScroll":
                delta = event.detail;
                break;
            case "mousewheel":
                delta = event.wheelDelta;
                break;
            case "wheel":
                delta = event["deltaY"];
                break;
            default:
                throw "unrecognized mouse wheel event: " + event.type
        }
        return delta
    }),
    mouseX: 0,
    mouseY: 0,
    mouseMovementX: 0,
    mouseMovementY: 0,
    touches: {},
    lastTouches: {},
    calculateMouseEvent: (function(event) {
        if (Browser.pointerLock) {
            if (event.type != "mousemove" && "mozMovementX" in event) {
                Browser.mouseMovementX = Browser.mouseMovementY = 0
            } else {
                Browser.mouseMovementX = Browser.getMovementX(event);
                Browser.mouseMovementY = Browser.getMovementY(event)
            }
            if (typeof SDL != "undefined") {
                Browser.mouseX = SDL.mouseX + Browser.mouseMovementX;
                Browser.mouseY = SDL.mouseY + Browser.mouseMovementY
            } else {
                Browser.mouseX += Browser.mouseMovementX;
                Browser.mouseY += Browser.mouseMovementY
            }
        } else {
            var rect = Module["canvas"].getBoundingClientRect();
            var cw = Module["canvas"].width;
            var ch = Module["canvas"].height;
            var scrollX = typeof window.scrollX !== "undefined" ? window.scrollX : window.pageXOffset;
            var scrollY = typeof window.scrollY !== "undefined" ? window.scrollY : window.pageYOffset;
            if (event.type === "touchstart" || event.type === "touchend" || event.type === "touchmove") {
                var touch = event.touch;
                if (touch === undefined) {
                    return
                }
                var adjustedX = touch.pageX - (scrollX + rect.left);
                var adjustedY = touch.pageY - (scrollY + rect.top);
                adjustedX = adjustedX * (cw / rect.width);
                adjustedY = adjustedY * (ch / rect.height);
                var coords = {
                    x: adjustedX,
                    y: adjustedY
                };
                if (event.type === "touchstart") {
                    Browser.lastTouches[touch.identifier] = coords;
                    Browser.touches[touch.identifier] = coords
                } else if (event.type === "touchend" || event.type === "touchmove") {
                    var last = Browser.touches[touch.identifier];
                    if (!last) last = coords;
                    Browser.lastTouches[touch.identifier] = last;
                    Browser.touches[touch.identifier] = coords
                }
                return
            }
            var x = event.pageX - (scrollX + rect.left);
            var y = event.pageY - (scrollY + rect.top);
            x = x * (cw / rect.width);
            y = y * (ch / rect.height);
            Browser.mouseMovementX = x - Browser.mouseX;
            Browser.mouseMovementY = y - Browser.mouseY;
            Browser.mouseX = x;
            Browser.mouseY = y
        }
    }),
    asyncLoad: (function(url, onload, onerror, noRunDep) {
        var dep = !noRunDep ? getUniqueRunDependency("al " + url) : "";
        Module["readAsync"](url, (function(arrayBuffer) {
            assert(arrayBuffer, 'Loading data file "' + url + '" failed (no arrayBuffer).');
            onload(new Uint8Array(arrayBuffer));
            if (dep) removeRunDependency(dep)
        }), (function(event) {
            if (onerror) {
                onerror()
            } else {
                throw 'Loading data file "' + url + '" failed.'
            }
        }));
        if (dep) addRunDependency(dep)
    }),
    resizeListeners: [],
    updateResizeListeners: (function() {
        var canvas = Module["canvas"];
        Browser.resizeListeners.forEach((function(listener) {
            listener(canvas.width, canvas.height)
        }))
    }),
    setCanvasSize: (function(width, height, noUpdates) {
        var canvas = Module["canvas"];
        Browser.updateCanvasDimensions(canvas, width, height);
        if (!noUpdates) Browser.updateResizeListeners()
    }),
    windowedWidth: 0,
    windowedHeight: 0,
    setFullscreenCanvasSize: (function() {
        if (typeof SDL != "undefined") {
            var flags = HEAPU32[SDL.screen >> 2];
            flags = flags | 8388608;
            HEAP32[SDL.screen >> 2] = flags
        }
        Browser.updateResizeListeners()
    }),
    setWindowedCanvasSize: (function() {
        if (typeof SDL != "undefined") {
            var flags = HEAPU32[SDL.screen >> 2];
            flags = flags & ~8388608;
            HEAP32[SDL.screen >> 2] = flags
        }
        Browser.updateResizeListeners()
    }),
    updateCanvasDimensions: (function(canvas, wNative, hNative) {
        if (wNative && hNative) {
            canvas.widthNative = wNative;
            canvas.heightNative = hNative
        } else {
            wNative = canvas.widthNative;
            hNative = canvas.heightNative
        }
        var w = wNative;
        var h = hNative;
        if (Module["forcedAspectRatio"] && Module["forcedAspectRatio"] > 0) {
            if (w / h < Module["forcedAspectRatio"]) {
                w = Math.round(h * Module["forcedAspectRatio"])
            } else {
                h = Math.round(w / Module["forcedAspectRatio"])
            }
        }
        if ((document["fullscreenElement"] || document["mozFullScreenElement"] || document["msFullscreenElement"] || document["webkitFullscreenElement"] || document["webkitCurrentFullScreenElement"]) === canvas.parentNode && typeof screen != "undefined") {
            var factor = Math.min(screen.width / w, screen.height / h);
            w = Math.round(w * factor);
            h = Math.round(h * factor)
        }
        if (Browser.resizeCanvas) {
            if (canvas.width != w) canvas.width = w;
            if (canvas.height != h) canvas.height = h;
            if (typeof canvas.style != "undefined") {
                canvas.style.removeProperty("width");
                canvas.style.removeProperty("height")
            }
        } else {
            if (canvas.width != wNative) canvas.width = wNative;
            if (canvas.height != hNative) canvas.height = hNative;
            if (typeof canvas.style != "undefined") {
                if (w != wNative || h != hNative) {
                    canvas.style.setProperty("width", w + "px", "important");
                    canvas.style.setProperty("height", h + "px", "important")
                } else {
                    canvas.style.removeProperty("width");
                    canvas.style.removeProperty("height")
                }
            }
        }
    }),
    wgetRequests: {},
    nextWgetRequestHandle: 0,
    getNextWgetRequestHandle: (function() {
        var handle = Browser.nextWgetRequestHandle;
        Browser.nextWgetRequestHandle++;
        return handle
    })
};

function _usleep(useconds) {
    var msec = useconds / 1e3;
    if ((ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) && self["performance"] && self["performance"]["now"]) {
        var start = self["performance"]["now"]();
        while (self["performance"]["now"]() - start < msec) {}
    } else {
        var start = Date.now();
        while (Date.now() - start < msec) {}
    }
    return 0
}
var RA = {
    BUFFER_SIZE: 2048,
    context: null,
    buffers: [],
    numBuffers: 0,
    bufIndex: 0,
    bufOffset: 0,
    startTime: 0,
    nonblock: false,
    currentTimeWorkaround: false,
    setStartTime: (function() {
        if (RA.context.currentTime) {
            RA.startTime = window["performance"]["now"]() - RA.context.currentTime * 1e3;
            Module["resumeMainLoop"]()
        } else window["setTimeout"](RA.setStartTime, 0)
    }),
    getCurrentPerfTime: (function() {
        if (RA.startTime) return (window["performance"]["now"]() - RA.startTime) / 1e3;
        else return 0
    }),
    process: (function(queueBuffers) {
        var currentTime = RA.getCurrentPerfTime();
        for (var i = 0; i < RA.bufIndex; i++) {
            if (RA.buffers[i].endTime !== 0 && RA.buffers[i].endTime < currentTime) {
                RA.buffers[i].endTime = 0;
                var buf = RA.buffers.splice(i, 1);
                RA.buffers[RA.numBuffers - 1] = buf[0];
                i--;
                RA.bufIndex--
            }
        }
    }),
    fillBuffer: (function(buf, samples) {
        var count = 0;
        const leftBuffer = RA.buffers[RA.bufIndex].getChannelData(0);
        const rightBuffer = RA.buffers[RA.bufIndex].getChannelData(1);
        while (samples && RA.bufOffset !== RA.BUFFER_SIZE) {
            leftBuffer[RA.bufOffset] = HEAPF32[buf + count * 8 >> 2];
            rightBuffer[RA.bufOffset] = HEAPF32[buf + (count * 8 + 4) >> 2];
            RA.bufOffset++;
            count++;
            samples--
        }
        return count
    }),
    queueAudio: (function() {
        var index = RA.bufIndex;
        var startTime;
        if (RA.bufIndex) startTime = RA.buffers[RA.bufIndex - 1].endTime;
        else startTime = RA.context.currentTime;
        RA.buffers[index].endTime = startTime + RA.buffers[index].duration;
        const bufferSource = RA.context.createBufferSource();
        bufferSource.buffer = RA.buffers[index];
        bufferSource.connect(RA.context.destination);
        bufferSource.start(startTime);
        RA.bufIndex++;
        RA.bufOffset = 0
    }),
    block: (function() {
        do {
            RA.process()
        } while (RA.bufIndex === RA.numBuffers)
    })
};

function _RWebAudioBufferSize() {
    return RA.numBuffers * RA.BUFFER_SIZE * 8
}

function _RWebAudioFree() {
    RA.bufIndex = 0;
    RA.bufOffset = 0
}

function _RWebAudioInit(latency) {
    var ac = window["AudioContext"] || window["webkitAudioContext"];
    if (!ac) return 0;
    RA.context = new ac;
    RA.numBuffers = latency * RA.context.sampleRate / (1e3 * RA.BUFFER_SIZE) | 0;
    if (RA.numBuffers < 2) RA.numBuffers = 2;
    for (var i = 0; i < RA.numBuffers; i++) {
        RA.buffers[i] = RA.context.createBuffer(2, RA.BUFFER_SIZE, RA.context.sampleRate);
        RA.buffers[i].endTime = 0
    }
    RA.nonblock = false;
    RA.startTime = 0;
    RA.context.createGain();
    window["setTimeout"](RA.setStartTime, 0);
    Module["pauseMainLoop"]();
    return 1
}

function _RWebAudioRecalibrateTime() {
    if (RA.startTime) {
        RA.startTime = window["performance"]["now"]() - RA.context.currentTime * 1e3
    }
}

function _RWebAudioSampleRate() {
    return RA.context.sampleRate
}

function _RWebAudioSetNonblockState(state) {
    RA.nonblock = state
}

function _RWebAudioStart() {
    return true
}

function _RWebAudioStop() {
    RA.bufIndex = 0;
    RA.bufOffset = 0;
    return true
}

function _RWebAudioWrite(buf, size) {
    RA.process();
    var samples = size / 8;
    var count = 0;
    while (samples) {
        if (RA.bufIndex === RA.numBuffers) {
            if (RA.nonblock) break;
            else RA.block()
        }
        var fill = RA.fillBuffer(buf, samples);
        samples -= fill;
        count += fill;
        buf += fill * 8;
        if (RA.bufOffset === RA.BUFFER_SIZE) {
            RA.queueAudio()
        }
    }
    return count * 8
}

function _RWebAudioWriteAvail() {
    RA.process();
    return ((RA.numBuffers - RA.bufIndex) * RA.BUFFER_SIZE - RA.bufOffset) * 8
}
var RWC = {
    RETRO_CAMERA_BUFFER_OPENGL_TEXTURE: 0,
    RETRO_CAMERA_BUFFER_RAW_FRAMEBUFFER: 1,
    tmp: null,
    contexts: [],
    counter: 0,
    ready: (function(data) {
        return RWC.contexts[data].runMode == 2 && !RWC.contexts[data].videoElement.paused && RWC.contexts[data].videoElement.videoWidth != 0 && RWC.contexts[data].videoElement.videoHeight != 0
    })
};

function _RWebCamFree(data) {
    RWC.contexts[data].videoElement.pause();
    URL.revokeObjectURL(RWC.contexts[data].videoElement.src);
    RWC.contexts[data].videoElement = null;
    RWC.contexts[data] = null
}

function _RWebCamInit(caps1, caps2, width, height) {
    if (!navigator) return 0;
    navigator.getMedia = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia;
    if (!navigator.getMedia) return 0;
    var c = ++RWC.counter;
    RWC.contexts[c] = [];
    RWC.contexts[c].videoElement = document.createElement("video");
    if (width !== 0 && height !== 0) {
        RWC.contexts[c].videoElement.width = width;
        RWC.contexts[c].videoElement.height = height
    }
    RWC.contexts[c].runMode = 1;
    RWC.contexts[c].glTex = caps1 & 1 << RWC.RETRO_CAMERA_BUFFER_OPENGL_TEXTURE;
    RWC.contexts[c].rawFb = caps1 & 1 << RWC.RETRO_CAMERA_BUFFER_RAW_FRAMEBUFFER;
    navigator.getMedia({
        video: true,
        audio: false
    }, (function(stream) {
        RWC.contexts[c].videoElement.autoplay = true;
        RWC.contexts[c].videoElement.src = URL.createObjectURL(stream);
        RWC.contexts[c].runMode = 2
    }), (function(err) {
        console.log("webcam request failed", err);
        RWC.runMode = 0
    }));
    if (!RWC.tmp) RWC.tmp = _malloc(4);
    return c
}
var GL = {
    counter: 1,
    lastError: 0,
    buffers: [],
    mappedBuffers: {},
    programs: [],
    framebuffers: [],
    renderbuffers: [],
    textures: [],
    uniforms: [],
    shaders: [],
    vaos: [],
    contexts: [],
    currentContext: null,
    offscreenCanvases: {},
    timerQueriesEXT: [],
    currArrayBuffer: 0,
    currElementArrayBuffer: 0,
    byteSizeByTypeRoot: 5120,
    byteSizeByType: [1, 1, 2, 2, 4, 4, 4, 2, 3, 4, 8],
    programInfos: {},
    stringCache: {},
    tempFixedLengthArray: [],
    packAlignment: 4,
    unpackAlignment: 4,
    init: (function() {
        GL.createLog2ceilLookup(GL.MAX_TEMP_BUFFER_SIZE);
        GL.miniTempBuffer = new Float32Array(GL.MINI_TEMP_BUFFER_SIZE);
        for (var i = 0; i < GL.MINI_TEMP_BUFFER_SIZE; i++) {
            GL.miniTempBufferViews[i] = GL.miniTempBuffer.subarray(0, i + 1)
        }
        for (var i = 0; i < 32; i++) {
            GL.tempFixedLengthArray.push(new Array(i))
        }
    }),
    recordError: function recordError(errorCode) {
        if (!GL.lastError) {
            GL.lastError = errorCode
        }
    },
    getNewId: (function(table) {
        var ret = GL.counter++;
        for (var i = table.length; i < ret; i++) {
            table[i] = null
        }
        return ret
    }),
    MINI_TEMP_BUFFER_SIZE: 256,
    miniTempBuffer: null,
    miniTempBufferViews: [0],
    MAX_TEMP_BUFFER_SIZE: 2097152,
    numTempVertexBuffersPerSize: 64,
    log2ceilLookup: null,
    createLog2ceilLookup: (function(maxValue) {
        GL.log2ceilLookup = new Uint8Array(maxValue + 1);
        var log2 = 0;
        var pow2 = 1;
        GL.log2ceilLookup[0] = 0;
        for (var i = 1; i <= maxValue; ++i) {
            if (i > pow2) {
                pow2 <<= 1;
                ++log2
            }
            GL.log2ceilLookup[i] = log2
        }
    }),
    generateTempBuffers: (function(quads, context) {
        var largestIndex = GL.log2ceilLookup[GL.MAX_TEMP_BUFFER_SIZE];
        context.tempVertexBufferCounters1 = [];
        context.tempVertexBufferCounters2 = [];
        context.tempVertexBufferCounters1.length = context.tempVertexBufferCounters2.length = largestIndex + 1;
        context.tempVertexBuffers1 = [];
        context.tempVertexBuffers2 = [];
        context.tempVertexBuffers1.length = context.tempVertexBuffers2.length = largestIndex + 1;
        context.tempIndexBuffers = [];
        context.tempIndexBuffers.length = largestIndex + 1;
        for (var i = 0; i <= largestIndex; ++i) {
            context.tempIndexBuffers[i] = null;
            context.tempVertexBufferCounters1[i] = context.tempVertexBufferCounters2[i] = 0;
            var ringbufferLength = GL.numTempVertexBuffersPerSize;
            context.tempVertexBuffers1[i] = [];
            context.tempVertexBuffers2[i] = [];
            var ringbuffer1 = context.tempVertexBuffers1[i];
            var ringbuffer2 = context.tempVertexBuffers2[i];
            ringbuffer1.length = ringbuffer2.length = ringbufferLength;
            for (var j = 0; j < ringbufferLength; ++j) {
                ringbuffer1[j] = ringbuffer2[j] = null
            }
        }
        if (quads) {
            context.tempQuadIndexBuffer = GLctx.createBuffer();
            context.GLctx.bindBuffer(context.GLctx.ELEMENT_ARRAY_BUFFER, context.tempQuadIndexBuffer);
            var numIndexes = GL.MAX_TEMP_BUFFER_SIZE >> 1;
            var quadIndexes = new Uint16Array(numIndexes);
            var i = 0,
                v = 0;
            while (1) {
                quadIndexes[i++] = v;
                if (i >= numIndexes) break;
                quadIndexes[i++] = v + 1;
                if (i >= numIndexes) break;
                quadIndexes[i++] = v + 2;
                if (i >= numIndexes) break;
                quadIndexes[i++] = v;
                if (i >= numIndexes) break;
                quadIndexes[i++] = v + 2;
                if (i >= numIndexes) break;
                quadIndexes[i++] = v + 3;
                if (i >= numIndexes) break;
                v += 4
            }
            context.GLctx.bufferData(context.GLctx.ELEMENT_ARRAY_BUFFER, quadIndexes, context.GLctx.STATIC_DRAW);
            context.GLctx.bindBuffer(context.GLctx.ELEMENT_ARRAY_BUFFER, null)
        }
    }),
    getTempVertexBuffer: function getTempVertexBuffer(sizeBytes) {
        var idx = GL.log2ceilLookup[sizeBytes];
        var ringbuffer = GL.currentContext.tempVertexBuffers1[idx];
        var nextFreeBufferIndex = GL.currentContext.tempVertexBufferCounters1[idx];
        GL.currentContext.tempVertexBufferCounters1[idx] = GL.currentContext.tempVertexBufferCounters1[idx] + 1 & GL.numTempVertexBuffersPerSize - 1;
        var vbo = ringbuffer[nextFreeBufferIndex];
        if (vbo) {
            return vbo
        }
        var prevVBO = GLctx.getParameter(GLctx.ARRAY_BUFFER_BINDING);
        ringbuffer[nextFreeBufferIndex] = GLctx.createBuffer();
        GLctx.bindBuffer(GLctx.ARRAY_BUFFER, ringbuffer[nextFreeBufferIndex]);
        GLctx.bufferData(GLctx.ARRAY_BUFFER, 1 << idx, GLctx.DYNAMIC_DRAW);
        GLctx.bindBuffer(GLctx.ARRAY_BUFFER, prevVBO);
        return ringbuffer[nextFreeBufferIndex]
    },
    getTempIndexBuffer: function getTempIndexBuffer(sizeBytes) {
        var idx = GL.log2ceilLookup[sizeBytes];
        var ibo = GL.currentContext.tempIndexBuffers[idx];
        if (ibo) {
            return ibo
        }
        var prevIBO = GLctx.getParameter(GLctx.ELEMENT_ARRAY_BUFFER_BINDING);
        GL.currentContext.tempIndexBuffers[idx] = GLctx.createBuffer();
        GLctx.bindBuffer(GLctx.ELEMENT_ARRAY_BUFFER, GL.currentContext.tempIndexBuffers[idx]);
        GLctx.bufferData(GLctx.ELEMENT_ARRAY_BUFFER, 1 << idx, GLctx.DYNAMIC_DRAW);
        GLctx.bindBuffer(GLctx.ELEMENT_ARRAY_BUFFER, prevIBO);
        return GL.currentContext.tempIndexBuffers[idx]
    },
    newRenderingFrameStarted: function newRenderingFrameStarted() {
        if (!GL.currentContext) {
            return
        }
        var vb = GL.currentContext.tempVertexBuffers1;
        GL.currentContext.tempVertexBuffers1 = GL.currentContext.tempVertexBuffers2;
        GL.currentContext.tempVertexBuffers2 = vb;
        vb = GL.currentContext.tempVertexBufferCounters1;
        GL.currentContext.tempVertexBufferCounters1 = GL.currentContext.tempVertexBufferCounters2;
        GL.currentContext.tempVertexBufferCounters2 = vb;
        var largestIndex = GL.log2ceilLookup[GL.MAX_TEMP_BUFFER_SIZE];
        for (var i = 0; i <= largestIndex; ++i) {
            GL.currentContext.tempVertexBufferCounters1[i] = 0
        }
    },
    getSource: (function(shader, count, string, length) {
        var source = "";
        for (var i = 0; i < count; ++i) {
            var frag;
            if (length) {
                var len = HEAP32[length + i * 4 >> 2];
                if (len < 0) {
                    frag = Pointer_stringify(HEAP32[string + i * 4 >> 2])
                } else {
                    frag = Pointer_stringify(HEAP32[string + i * 4 >> 2], len)
                }
            } else {
                frag = Pointer_stringify(HEAP32[string + i * 4 >> 2])
            }
            source += frag
        }
        return source
    }),
    calcBufLength: function calcBufLength(size, type, stride, count) {
        if (stride > 0) {
            return count * stride
        }
        var typeSize = GL.byteSizeByType[type - GL.byteSizeByTypeRoot];
        return size * typeSize * count
    },
    usedTempBuffers: [],
    preDrawHandleClientVertexAttribBindings: function preDrawHandleClientVertexAttribBindings(count) {
        GL.resetBufferBinding = false;
        for (var i = 0; i < GL.currentContext.maxVertexAttribs; ++i) {
            var cb = GL.currentContext.clientBuffers[i];
            if (!cb.clientside || !cb.enabled) continue;
            GL.resetBufferBinding = true;
            var size = GL.calcBufLength(cb.size, cb.type, cb.stride, count);
            var buf = GL.getTempVertexBuffer(size);
            GLctx.bindBuffer(GLctx.ARRAY_BUFFER, buf);
            GLctx.bufferSubData(GLctx.ARRAY_BUFFER, 0, HEAPU8.subarray(cb.ptr, cb.ptr + size));
            GLctx.vertexAttribPointer(i, cb.size, cb.type, cb.normalized, cb.stride, 0)
        }
    },
    postDrawHandleClientVertexAttribBindings: function postDrawHandleClientVertexAttribBindings() {
        if (GL.resetBufferBinding) {
            GLctx.bindBuffer(GLctx.ARRAY_BUFFER, GL.buffers[GL.currArrayBuffer])
        }
    },
    createContext: (function(canvas, webGLContextAttributes) {
        if (typeof webGLContextAttributes["majorVersion"] === "undefined" && typeof webGLContextAttributes["minorVersion"] === "undefined") {
            webGLContextAttributes["majorVersion"] = 1;
            webGLContextAttributes["minorVersion"] = 0
        }
        var ctx;
        var errorInfo = "?";

        function onContextCreationError(event) {
            errorInfo = event.statusMessage || errorInfo
        }
        try {
            canvas.addEventListener("webglcontextcreationerror", onContextCreationError, false);
            try {
                if (webGLContextAttributes["majorVersion"] == 1 && webGLContextAttributes["minorVersion"] == 0) {
                    ctx = canvas.getContext("webgl", webGLContextAttributes) || canvas.getContext("experimental-webgl", webGLContextAttributes)
                } else if (webGLContextAttributes["majorVersion"] == 2 && webGLContextAttributes["minorVersion"] == 0) {
                    ctx = canvas.getContext("webgl2", webGLContextAttributes)
                } else {
                    throw "Unsupported WebGL context version " + majorVersion + "." + minorVersion + "!"
                }
            } finally {
                canvas.removeEventListener("webglcontextcreationerror", onContextCreationError, false)
            }
            if (!ctx) throw ":("
        } catch (e) {
            Module.print("Could not create canvas: " + [errorInfo, e, JSON.stringify(webGLContextAttributes)]);
            return 0
        }
        if (!ctx) return 0;
        var context = GL.registerContext(ctx, webGLContextAttributes);
        return context
    }),
    registerContext: (function(ctx, webGLContextAttributes) {
        var handle = GL.getNewId(GL.contexts);
        var context = {
            handle: handle,
            attributes: webGLContextAttributes,
            version: webGLContextAttributes["majorVersion"],
            GLctx: ctx
        };
        if (ctx.canvas) ctx.canvas.GLctxObject = context;
        GL.contexts[handle] = context;
        if (typeof webGLContextAttributes["enableExtensionsByDefault"] === "undefined" || webGLContextAttributes["enableExtensionsByDefault"]) {
            GL.initExtensions(context)
        }
        return handle
    }),
    makeContextCurrent: (function(contextHandle) {
        var context = GL.contexts[contextHandle];
        if (!context) return false;
        GLctx = Module.ctx = context.GLctx;
        GL.currentContext = context;
        return true
    }),
    getContext: (function(contextHandle) {
        return GL.contexts[contextHandle]
    }),
    deleteContext: (function(contextHandle) {
        if (GL.currentContext === GL.contexts[contextHandle]) GL.currentContext = null;
        if (typeof JSEvents === "object") JSEvents.removeAllHandlersOnTarget(GL.contexts[contextHandle].GLctx.canvas);
        if (GL.contexts[contextHandle] && GL.contexts[contextHandle].GLctx.canvas) GL.contexts[contextHandle].GLctx.canvas.GLctxObject = undefined;
        GL.contexts[contextHandle] = null
    }),
    initExtensions: (function(context) {
        if (!context) context = GL.currentContext;
        if (context.initExtensionsDone) return;
        context.initExtensionsDone = true;
        var GLctx = context.GLctx;
        context.maxVertexAttribs = GLctx.getParameter(GLctx.MAX_VERTEX_ATTRIBS);
        context.clientBuffers = [];
        for (var i = 0; i < context.maxVertexAttribs; i++) {
            context.clientBuffers[i] = {
                enabled: false,
                clientside: false,
                size: 0,
                type: 0,
                normalized: 0,
                stride: 0,
                ptr: 0
            }
        }
        GL.generateTempBuffers(false, context);
        if (context.version < 2) {
            var instancedArraysExt = GLctx.getExtension("ANGLE_instanced_arrays");
            if (instancedArraysExt) {
                GLctx["vertexAttribDivisor"] = (function(index, divisor) {
                    instancedArraysExt["vertexAttribDivisorANGLE"](index, divisor)
                });
                GLctx["drawArraysInstanced"] = (function(mode, first, count, primcount) {
                    instancedArraysExt["drawArraysInstancedANGLE"](mode, first, count, primcount)
                });
                GLctx["drawElementsInstanced"] = (function(mode, count, type, indices, primcount) {
                    instancedArraysExt["drawElementsInstancedANGLE"](mode, count, type, indices, primcount)
                })
            }
            var vaoExt = GLctx.getExtension("OES_vertex_array_object");
            if (vaoExt) {
                GLctx["createVertexArray"] = (function() {
                    return vaoExt["createVertexArrayOES"]()
                });
                GLctx["deleteVertexArray"] = (function(vao) {
                    vaoExt["deleteVertexArrayOES"](vao)
                });
                GLctx["bindVertexArray"] = (function(vao) {
                    vaoExt["bindVertexArrayOES"](vao)
                });
                GLctx["isVertexArray"] = (function(vao) {
                    return vaoExt["isVertexArrayOES"](vao)
                })
            }
            var drawBuffersExt = GLctx.getExtension("WEBGL_draw_buffers");
            if (drawBuffersExt) {
                GLctx["drawBuffers"] = (function(n, bufs) {
                    drawBuffersExt["drawBuffersWEBGL"](n, bufs)
                })
            }
        }
        GLctx.disjointTimerQueryExt = GLctx.getExtension("EXT_disjoint_timer_query");
        var automaticallyEnabledExtensions = ["OES_texture_float", "OES_texture_half_float", "OES_standard_derivatives", "OES_vertex_array_object", "WEBGL_compressed_texture_s3tc", "WEBGL_depth_texture", "OES_element_index_uint", "EXT_texture_filter_anisotropic", "ANGLE_instanced_arrays", "OES_texture_float_linear", "OES_texture_half_float_linear", "WEBGL_compressed_texture_atc", "WEBKIT_WEBGL_compressed_texture_pvrtc", "WEBGL_compressed_texture_pvrtc", "EXT_color_buffer_half_float", "WEBGL_color_buffer_float", "EXT_frag_depth", "EXT_sRGB", "WEBGL_draw_buffers", "WEBGL_shared_resources", "EXT_shader_texture_lod", "EXT_color_buffer_float"];
        var exts = GLctx.getSupportedExtensions();
        if (exts && exts.length > 0) {
            GLctx.getSupportedExtensions().forEach((function(ext) {
                if (automaticallyEnabledExtensions.indexOf(ext) != -1) {
                    GLctx.getExtension(ext)
                }
            }))
        }
    }),
    populateUniformTable: (function(program) {
        var p = GL.programs[program];
        GL.programInfos[program] = {
            uniforms: {},
            maxUniformLength: 0,
            maxAttributeLength: -1,
            maxUniformBlockNameLength: -1
        };
        var ptable = GL.programInfos[program];
        var utable = ptable.uniforms;
        var numUniforms = GLctx.getProgramParameter(p, GLctx.ACTIVE_UNIFORMS);
        for (var i = 0; i < numUniforms; ++i) {
            var u = GLctx.getActiveUniform(p, i);
            var name = u.name;
            ptable.maxUniformLength = Math.max(ptable.maxUniformLength, name.length + 1);
            if (name.indexOf("]", name.length - 1) !== -1) {
                var ls = name.lastIndexOf("[");
                name = name.slice(0, ls)
            }
            var loc = GLctx.getUniformLocation(p, name);
            if (loc != null) {
                var id = GL.getNewId(GL.uniforms);
                utable[name] = [u.size, id];
                GL.uniforms[id] = loc;
                for (var j = 1; j < u.size; ++j) {
                    var n = name + "[" + j + "]";
                    loc = GLctx.getUniformLocation(p, n);
                    id = GL.getNewId(GL.uniforms);
                    GL.uniforms[id] = loc
                }
            }
        }
    })
};

function _glBindTexture(target, texture) {
    GLctx.bindTexture(target, texture ? GL.textures[texture] : null)
}

function emscriptenWebGLGet(name_, p, type) {
    if (!p) {
        GL.recordError(1281);
        return
    }
    var ret = undefined;
    switch (name_) {
        case 36346:
            ret = 1;
            break;
        case 36344:
            if (type !== "Integer" && type !== "Integer64") {
                GL.recordError(1280)
            }
            return;
        case 36345:
            ret = 0;
            break;
        case 34466:
            var formats = GLctx.getParameter(34467);
            ret = formats.length;
            break
    }
    if (ret === undefined) {
        var result = GLctx.getParameter(name_);
        switch (typeof result) {
            case "number":
                ret = result;
                break;
            case "boolean":
                ret = result ? 1 : 0;
                break;
            case "string":
                GL.recordError(1280);
                return;
            case "object":
                if (result === null) {
                    switch (name_) {
                        case 34964:
                        case 35725:
                        case 34965:
                        case 36006:
                        case 36007:
                        case 32873:
                        case 34068:
                            {
                                ret = 0;
                                break
                            };
                        default:
                            {
                                GL.recordError(1280);
                                return
                            }
                    }
                } else if (result instanceof Float32Array || result instanceof Uint32Array || result instanceof Int32Array || result instanceof Array) {
                    for (var i = 0; i < result.length; ++i) {
                        switch (type) {
                            case "Integer":
                                HEAP32[p + i * 4 >> 2] = result[i];
                                break;
                            case "Float":
                                HEAPF32[p + i * 4 >> 2] = result[i];
                                break;
                            case "Boolean":
                                HEAP8[p + i >> 0] = result[i] ? 1 : 0;
                                break;
                            default:
                                throw "internal glGet error, bad type: " + type
                        }
                    }
                    return
                } else if (result instanceof WebGLBuffer || result instanceof WebGLProgram || result instanceof WebGLFramebuffer || result instanceof WebGLRenderbuffer || result instanceof WebGLTexture) {
                    ret = result.name | 0
                } else {
                    GL.recordError(1280);
                    return
                }
                break;
            default:
                GL.recordError(1280);
                return
        }
    }
    switch (type) {
        case "Integer64":
            tempI64 = [ret >>> 0, (tempDouble = ret, +Math_abs(tempDouble) >= 1 ? tempDouble > 0 ? (Math_min(+Math_floor(tempDouble / 4294967296), 4294967295) | 0) >>> 0 : ~~+Math_ceil((tempDouble - +(~~tempDouble >>> 0)) / 4294967296) >>> 0 : 0)], HEAP32[p >> 2] = tempI64[0], HEAP32[p + 4 >> 2] = tempI64[1];
            break;
        case "Integer":
            HEAP32[p >> 2] = ret;
            break;
        case "Float":
            HEAPF32[p >> 2] = ret;
            break;
        case "Boolean":
            HEAP8[p >> 0] = ret ? 1 : 0;
            break;
        default:
            throw "internal glGet error, bad type: " + type
    }
}

function _glGetIntegerv(name_, p) {
    emscriptenWebGLGet(name_, p, "Integer")
}

function _RWebCamPoll(data, frame_raw_cb, frame_gl_cb) {
    if (!RWC.ready(data)) return 0;
    var ret = 0;
    if (RWC.contexts[data].glTexId !== 0 && frame_gl_cb !== 0) {
        _glGetIntegerv(32873, RWC.tmp);
        var prev = HEAP32[RWC.tmp >> 2];
        _glBindTexture(3553, RWC.contexts[data].glTexId);
        if (RWC.contexts[data].glFirstFrame) {
            Module.ctx.texImage2D(Module.ctx.TEXTURE_2D, 0, Module.ctx.RGB, Module.ctx.RGB, Module.ctx.UNSIGNED_BYTE, RWC.contexts[data].videoElement);
            RWC.contexts[data].glFirstFrame = false
        } else {
            Module.ctx.texSubImage2D(Module.ctx.TEXTURE_2D, 0, 0, 0, Module.ctx.RGB, Module.ctx.UNSIGNED_BYTE, RWC.contexts[data].videoElement)
        }
        _glBindTexture(3553, prev);
        Runtime.dynCall("viii", frame_gl_cb, [RWC.contexts[data].glTexId, 3553, 0]);
        ret = 1
    }
    if (RWC.contexts[data].rawFbCanvas && frame_raw_cb !== 0) {
        if (!RWC.contexts[data].rawFbCanvasCtx) {
            RWC.contexts[data].rawFbCanvas.width = RWC.contexts[data].videoElement.videoWidth;
            RWC.contexts[data].rawFbCanvas.height = RWC.contexts[data].videoElement.videoHeight;
            RWC.contexts[data].rawFbCanvasCtx = RWC.contexts[data].rawFbCanvas.getContext("2d");
            RWC.contexts[data].rawBuffer = _malloc(RWC.contexts[data].videoElement.videoWidth * RWC.contexts[data].videoElement.videoHeight * 4)
        }
        RWC.contexts[data].rawFbCanvasCtx.drawImage(RWC.contexts[data].videoElement, 0, 0, RWC.contexts[data].rawFbCanvas.width, RWC.contexts[data].rawFbCanvas.height);
        var image = RWC.contexts[data].rawFbCanvasCtx.getImageData(0, 0, RWC.contexts[data].videoElement.videoWidth, RWC.contexts[data].videoElement.videoHeight);
        Module.HEAPU8.set(image.data, RWC.contexts[data].rawBuffer);
        Runtime.dynCall("viiii", frame_raw_cb, [RWC.contexts[data].rawBuffer, RWC.contexts[data].videoElement.videoWidth, RWC.contexts[data].videoElement.videoHeight, RWC.contexts[data].videoElement.videoWidth * 4]);
        ret = 1
    }
    return ret
}

function _glGenTextures(n, textures) {
    for (var i = 0; i < n; i++) {
        var texture = GLctx.createTexture();
        if (!texture) {
            GL.recordError(1282);
            while (i < n) HEAP32[textures + i++ * 4 >> 2] = 0;
            return
        }
        var id = GL.getNewId(GL.textures);
        texture.name = id;
        GL.textures[id] = texture;
        HEAP32[textures + i * 4 >> 2] = id
    }
}

function _glTexParameteri(x0, x1, x2) {
    GLctx["texParameteri"](x0, x1, x2)
}

function _RWebCamStart(data) {
    var ret = 0;
    if (RWC.contexts[data].glTex) {
        _glGenTextures(1, RWC.tmp);
        RWC.contexts[data].glTexId = HEAP32[RWC.tmp >> 2];
        if (RWC.contexts[data].glTexId !== 0) {
            _glGetIntegerv(32873, RWC.tmp);
            var prev = HEAP32[RWC.tmp >> 2];
            _glBindTexture(3553, RWC.contexts[data].glTexId);
            _glTexParameteri(3553, 10240, 9729);
            _glTexParameteri(3553, 10241, 9729);
            _glTexParameteri(3553, 10242, 33071);
            _glTexParameteri(3553, 10243, 33071);
            _glBindTexture(3553, prev);
            RWC.contexts[data].glFirstFrame = true;
            ret = 1
        }
    }
    if (RWC.contexts[data].rawFb) {
        RWC.contexts[data].rawFbCanvas = document.createElement("canvas");
        ret = 1
    }
    return ret
}

function _glDeleteTextures(n, textures) {
    for (var i = 0; i < n; i++) {
        var id = HEAP32[textures + i * 4 >> 2];
        var texture = GL.textures[id];
        if (!texture) continue;
        GLctx.deleteTexture(texture);
        texture.name = 0;
        GL.textures[id] = null
    }
}

function _RWebCamStop(data) {
    if (RWC.contexts[data].glTexId) {
        _glDeleteTextures(1, RWC.contexts[data].glTexId)
    }
    if (RWC.contexts[data].rawFbCanvas) {
        if (RWC.contexts[data].rawBuffer) {
            _free(RWC.contexts[data].rawBuffer);
            RWC.contexts[data].rawBuffer = 0;
            RWC.contexts[data].rawFbCanvasCtx = null
        }
        RWC.contexts[data].rawFbCanvas = null
    }
}

function ___assert_fail(condition, filename, line, func) {
    abort("Assertion failed: " + Pointer_stringify(condition) + ", at: " + [filename ? Pointer_stringify(filename) : "unknown filename", line, func ? Pointer_stringify(func) : "unknown function"])
}

function ___cxa_allocate_exception(size) {
    return _malloc(size)
}

function _atexit(func, arg) {
    __ATEXIT__.unshift({
        func: func,
        arg: arg
    })
}

function ___cxa_atexit() {
    return _atexit.apply(null, arguments)
}

function __ZSt18uncaught_exceptionv() {
    return !!__ZSt18uncaught_exceptionv.uncaught_exception
}
var EXCEPTIONS = {
    last: 0,
    caught: [],
    infos: {},
    deAdjust: (function(adjusted) {
        if (!adjusted || EXCEPTIONS.infos[adjusted]) return adjusted;
        for (var ptr in EXCEPTIONS.infos) {
            var info = EXCEPTIONS.infos[ptr];
            if (info.adjusted === adjusted) {
                return ptr
            }
        }
        return adjusted
    }),
    addRef: (function(ptr) {
        if (!ptr) return;
        var info = EXCEPTIONS.infos[ptr];
        info.refcount++
    }),
    decRef: (function(ptr) {
        if (!ptr) return;
        var info = EXCEPTIONS.infos[ptr];
        assert(info.refcount > 0);
        info.refcount--;
        if (info.refcount === 0 && !info.rethrown) {
            if (info.destructor) {
                Module["dynCall_vi"](info.destructor, ptr)
            }
            delete EXCEPTIONS.infos[ptr];
            ___cxa_free_exception(ptr)
        }
    }),
    clearRef: (function(ptr) {
        if (!ptr) return;
        var info = EXCEPTIONS.infos[ptr];
        info.refcount = 0
    })
};

function ___cxa_begin_catch(ptr) {
    var info = EXCEPTIONS.infos[ptr];
    if (info && !info.caught) {
        info.caught = true;
        __ZSt18uncaught_exceptionv.uncaught_exception--
    }
    if (info) info.rethrown = false;
    EXCEPTIONS.caught.push(ptr);
    EXCEPTIONS.addRef(EXCEPTIONS.deAdjust(ptr));
    return ptr
}

function ___cxa_pure_virtual() {
    ABORT = true;
    throw "Pure virtual function called!"
}

function ___resumeException(ptr) {
    if (!EXCEPTIONS.last) {
        EXCEPTIONS.last = ptr
    }
    throw ptr + " - Exception catching is disabled, this exception cannot be caught. Compile with -s DISABLE_EXCEPTION_CATCHING=0 or DISABLE_EXCEPTION_CATCHING=2 to catch."
}

function ___cxa_find_matching_catch() {
    var thrown = EXCEPTIONS.last;
    if (!thrown) {
        return (setTempRet0(0), 0) | 0
    }
    var info = EXCEPTIONS.infos[thrown];
    var throwntype = info.type;
    if (!throwntype) {
        return (setTempRet0(0), thrown) | 0
    }
    var typeArray = Array.prototype.slice.call(arguments);
    var pointer = Module["___cxa_is_pointer_type"](throwntype);
    if (!___cxa_find_matching_catch.buffer) ___cxa_find_matching_catch.buffer = _malloc(4);
    HEAP32[___cxa_find_matching_catch.buffer >> 2] = thrown;
    thrown = ___cxa_find_matching_catch.buffer;
    for (var i = 0; i < typeArray.length; i++) {
        if (typeArray[i] && Module["___cxa_can_catch"](typeArray[i], throwntype, thrown)) {
            thrown = HEAP32[thrown >> 2];
            info.adjusted = thrown;
            return (setTempRet0(typeArray[i]), thrown) | 0
        }
    }
    thrown = HEAP32[thrown >> 2];
    return (setTempRet0(throwntype), thrown) | 0
}

function ___cxa_throw(ptr, type, destructor) {
    EXCEPTIONS.infos[ptr] = {
        ptr: ptr,
        adjusted: ptr,
        type: type,
        destructor: destructor,
        refcount: 0,
        caught: false,
        rethrown: false
    };
    EXCEPTIONS.last = ptr;
    if (!("uncaught_exception" in __ZSt18uncaught_exceptionv)) {
        __ZSt18uncaught_exceptionv.uncaught_exception = 1
    } else {
        __ZSt18uncaught_exceptionv.uncaught_exception++
    }
    throw ptr + " - Exception catching is disabled, this exception cannot be caught. Compile with -s DISABLE_EXCEPTION_CATCHING=0 or DISABLE_EXCEPTION_CATCHING=2 to catch."
}

function ___gxx_personality_v0() {}

function ___lock() {}
var ERRNO_CODES = {
    EPERM: 1,
    ENOENT: 2,
    ESRCH: 3,
    EINTR: 4,
    EIO: 5,
    ENXIO: 6,
    E2BIG: 7,
    ENOEXEC: 8,
    EBADF: 9,
    ECHILD: 10,
    EAGAIN: 11,
    EWOULDBLOCK: 11,
    ENOMEM: 12,
    EACCES: 13,
    EFAULT: 14,
    ENOTBLK: 15,
    EBUSY: 16,
    EEXIST: 17,
    EXDEV: 18,
    ENODEV: 19,
    ENOTDIR: 20,
    EISDIR: 21,
    EINVAL: 22,
    ENFILE: 23,
    EMFILE: 24,
    ENOTTY: 25,
    ETXTBSY: 26,
    EFBIG: 27,
    ENOSPC: 28,
    ESPIPE: 29,
    EROFS: 30,
    EMLINK: 31,
    EPIPE: 32,
    EDOM: 33,
    ERANGE: 34,
    ENOMSG: 42,
    EIDRM: 43,
    ECHRNG: 44,
    EL2NSYNC: 45,
    EL3HLT: 46,
    EL3RST: 47,
    ELNRNG: 48,
    EUNATCH: 49,
    ENOCSI: 50,
    EL2HLT: 51,
    EDEADLK: 35,
    ENOLCK: 37,
    EBADE: 52,
    EBADR: 53,
    EXFULL: 54,
    ENOANO: 55,
    EBADRQC: 56,
    EBADSLT: 57,
    EDEADLOCK: 35,
    EBFONT: 59,
    ENOSTR: 60,
    ENODATA: 61,
    ETIME: 62,
    ENOSR: 63,
    ENONET: 64,
    ENOPKG: 65,
    EREMOTE: 66,
    ENOLINK: 67,
    EADV: 68,
    ESRMNT: 69,
    ECOMM: 70,
    EPROTO: 71,
    EMULTIHOP: 72,
    EDOTDOT: 73,
    EBADMSG: 74,
    ENOTUNIQ: 76,
    EBADFD: 77,
    EREMCHG: 78,
    ELIBACC: 79,
    ELIBBAD: 80,
    ELIBSCN: 81,
    ELIBMAX: 82,
    ELIBEXEC: 83,
    ENOSYS: 38,
    ENOTEMPTY: 39,
    ENAMETOOLONG: 36,
    ELOOP: 40,
    EOPNOTSUPP: 95,
    EPFNOSUPPORT: 96,
    ECONNRESET: 104,
    ENOBUFS: 105,
    EAFNOSUPPORT: 97,
    EPROTOTYPE: 91,
    ENOTSOCK: 88,
    ENOPROTOOPT: 92,
    ESHUTDOWN: 108,
    ECONNREFUSED: 111,
    EADDRINUSE: 98,
    ECONNABORTED: 103,
    ENETUNREACH: 101,
    ENETDOWN: 100,
    ETIMEDOUT: 110,
    EHOSTDOWN: 112,
    EHOSTUNREACH: 113,
    EINPROGRESS: 115,
    EALREADY: 114,
    EDESTADDRREQ: 89,
    EMSGSIZE: 90,
    EPROTONOSUPPORT: 93,
    ESOCKTNOSUPPORT: 94,
    EADDRNOTAVAIL: 99,
    ENETRESET: 102,
    EISCONN: 106,
    ENOTCONN: 107,
    ETOOMANYREFS: 109,
    EUSERS: 87,
    EDQUOT: 122,
    ESTALE: 116,
    ENOTSUP: 95,
    ENOMEDIUM: 123,
    EILSEQ: 84,
    EOVERFLOW: 75,
    ECANCELED: 125,
    ENOTRECOVERABLE: 131,
    EOWNERDEAD: 130,
    ESTRPIPE: 86
};
var ERRNO_MESSAGES = {
    0: "Success",
    1: "Not super-user",
    2: "No such file or directory",
    3: "No such process",
    4: "Interrupted system call",
    5: "I/O error",
    6: "No such device or address",
    7: "Arg list too long",
    8: "Exec format error",
    9: "Bad file number",
    10: "No children",
    11: "No more processes",
    12: "Not enough core",
    13: "Permission denied",
    14: "Bad address",
    15: "Block device required",
    16: "Mount device busy",
    17: "File exists",
    18: "Cross-device link",
    19: "No such device",
    20: "Not a directory",
    21: "Is a directory",
    22: "Invalid argument",
    23: "Too many open files in system",
    24: "Too many open files",
    25: "Not a typewriter",
    26: "Text file busy",
    27: "File too large",
    28: "No space left on device",
    29: "Illegal seek",
    30: "Read only file system",
    31: "Too many links",
    32: "Broken pipe",
    33: "Math arg out of domain of func",
    34: "Math result not representable",
    35: "File locking deadlock error",
    36: "File or path name too long",
    37: "No record locks available",
    38: "Function not implemented",
    39: "Directory not empty",
    40: "Too many symbolic links",
    42: "No message of desired type",
    43: "Identifier removed",
    44: "Channel number out of range",
    45: "Level 2 not synchronized",
    46: "Level 3 halted",
    47: "Level 3 reset",
    48: "Link number out of range",
    49: "Protocol driver not attached",
    50: "No CSI structure available",
    51: "Level 2 halted",
    52: "Invalid exchange",
    53: "Invalid request descriptor",
    54: "Exchange full",
    55: "No anode",
    56: "Invalid request code",
    57: "Invalid slot",
    59: "Bad font file fmt",
    60: "Device not a stream",
    61: "No data (for no delay io)",
    62: "Timer expired",
    63: "Out of streams resources",
    64: "Machine is not on the network",
    65: "Package not installed",
    66: "The object is remote",
    67: "The link has been severed",
    68: "Advertise error",
    69: "Srmount error",
    70: "Communication error on send",
    71: "Protocol error",
    72: "Multihop attempted",
    73: "Cross mount point (not really error)",
    74: "Trying to read unreadable message",
    75: "Value too large for defined data type",
    76: "Given log. name not unique",
    77: "f.d. invalid for this operation",
    78: "Remote address changed",
    79: "Can   access a needed shared lib",
    80: "Accessing a corrupted shared lib",
    81: ".lib section in a.out corrupted",
    82: "Attempting to link in too many libs",
    83: "Attempting to exec a shared library",
    84: "Illegal byte sequence",
    86: "Streams pipe error",
    87: "Too many users",
    88: "Socket operation on non-socket",
    89: "Destination address required",
    90: "Message too long",
    91: "Protocol wrong type for socket",
    92: "Protocol not available",
    93: "Unknown protocol",
    94: "Socket type not supported",
    95: "Not supported",
    96: "Protocol family not supported",
    97: "Address family not supported by protocol family",
    98: "Address already in use",
    99: "Address not available",
    100: "Network interface is not configured",
    101: "Network is unreachable",
    102: "Connection reset by network",
    103: "Connection aborted",
    104: "Connection reset by peer",
    105: "No buffer space available",
    106: "Socket is already connected",
    107: "Socket is not connected",
    108: "Can't send after socket shutdown",
    109: "Too many references",
    110: "Connection timed out",
    111: "Connection refused",
    112: "Host is down",
    113: "Host is unreachable",
    114: "Socket already connected",
    115: "Connection already in progress",
    116: "Stale file handle",
    122: "Quota exceeded",
    123: "No medium (in tape drive)",
    125: "Operation canceled",
    130: "Previous owner died",
    131: "State not recoverable"
};

function ___setErrNo(value) {
    if (Module["___errno_location"]) HEAP32[Module["___errno_location"]() >> 2] = value;
    return value
}
var PATH = {
    splitPath: (function(filename) {
        var splitPathRe = /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/;
        return splitPathRe.exec(filename).slice(1)
    }),
    normalizeArray: (function(parts, allowAboveRoot) {
        var up = 0;
        for (var i = parts.length - 1; i >= 0; i--) {
            var last = parts[i];
            if (last === ".") {
                parts.splice(i, 1)
            } else if (last === "..") {
                parts.splice(i, 1);
                up++
            } else if (up) {
                parts.splice(i, 1);
                up--
            }
        }
        if (allowAboveRoot) {
            for (; up; up--) {
                parts.unshift("..")
            }
        }
        return parts
    }),
    normalize: (function(path) {
        var isAbsolute = path.charAt(0) === "/",
            trailingSlash = path.substr(-1) === "/";
        path = PATH.normalizeArray(path.split("/").filter((function(p) {
            return !!p
        })), !isAbsolute).join("/");
        if (!path && !isAbsolute) {
            path = "."
        }
        if (path && trailingSlash) {
            path += "/"
        }
        return (isAbsolute ? "/" : "") + path
    }),
    dirname: (function(path) {
        var result = PATH.splitPath(path),
            root = result[0],
            dir = result[1];
        if (!root && !dir) {
            return "."
        }
        if (dir) {
            dir = dir.substr(0, dir.length - 1)
        }
        return root + dir
    }),
    basename: (function(path) {
        if (path === "/") return "/";
        var lastSlash = path.lastIndexOf("/");
        if (lastSlash === -1) return path;
        return path.substr(lastSlash + 1)
    }),
    extname: (function(path) {
        return PATH.splitPath(path)[3]
    }),
    join: (function() {
        var paths = Array.prototype.slice.call(arguments, 0);
        return PATH.normalize(paths.join("/"))
    }),
    join2: (function(l, r) {
        return PATH.normalize(l + "/" + r)
    }),
    resolve: (function() {
        var resolvedPath = "",
            resolvedAbsolute = false;
        for (var i = arguments.length - 1; i >= -1 && !resolvedAbsolute; i--) {
            var path = i >= 0 ? arguments[i] : FS.cwd();
            if (typeof path !== "string") {
                throw new TypeError("Arguments to path.resolve must be strings")
            } else if (!path) {
                return ""
            }
            resolvedPath = path + "/" + resolvedPath;
            resolvedAbsolute = path.charAt(0) === "/"
        }
        resolvedPath = PATH.normalizeArray(resolvedPath.split("/").filter((function(p) {
            return !!p
        })), !resolvedAbsolute).join("/");
        return (resolvedAbsolute ? "/" : "") + resolvedPath || "."
    }),
    relative: (function(from, to) {
        from = PATH.resolve(from).substr(1);
        to = PATH.resolve(to).substr(1);

        function trim(arr) {
            var start = 0;
            for (; start < arr.length; start++) {
                if (arr[start] !== "") break
            }
            var end = arr.length - 1;
            for (; end >= 0; end--) {
                if (arr[end] !== "") break
            }
            if (start > end) return [];
            return arr.slice(start, end - start + 1)
        }
        var fromParts = trim(from.split("/"));
        var toParts = trim(to.split("/"));
        var length = Math.min(fromParts.length, toParts.length);
        var samePartsLength = length;
        for (var i = 0; i < length; i++) {
            if (fromParts[i] !== toParts[i]) {
                samePartsLength = i;
                break
            }
        }
        var outputParts = [];
        for (var i = samePartsLength; i < fromParts.length; i++) {
            outputParts.push("..")
        }
        outputParts = outputParts.concat(toParts.slice(samePartsLength));
        return outputParts.join("/")
    })
};
var TTY = {
    ttys: [],
    init: (function() {}),
    shutdown: (function() {}),
    register: (function(dev, ops) {
        TTY.ttys[dev] = {
            input: [],
            output: [],
            ops: ops
        };
        FS.registerDevice(dev, TTY.stream_ops)
    }),
    stream_ops: {
        open: (function(stream) {
            var tty = TTY.ttys[stream.node.rdev];
            if (!tty) {
                throw new FS.ErrnoError(ERRNO_CODES.ENODEV)
            }
            stream.tty = tty;
            stream.seekable = false
        }),
        close: (function(stream) {
            stream.tty.ops.flush(stream.tty)
        }),
        flush: (function(stream) {
            stream.tty.ops.flush(stream.tty)
        }),
        read: (function(stream, buffer, offset, length, pos) {
            if (!stream.tty || !stream.tty.ops.get_char) {
                throw new FS.ErrnoError(ERRNO_CODES.ENXIO)
            }
            var bytesRead = 0;
            for (var i = 0; i < length; i++) {
                var result;
                try {
                    result = stream.tty.ops.get_char(stream.tty)
                } catch (e) {
                    throw new FS.ErrnoError(ERRNO_CODES.EIO)
                }
                if (result === undefined && bytesRead === 0) {
                    throw new FS.ErrnoError(ERRNO_CODES.EAGAIN)
                }
                if (result === null || result === undefined) break;
                bytesRead++;
                buffer[offset + i] = result
            }
            if (bytesRead) {
                stream.node.timestamp = Date.now()
            }
            return bytesRead
        }),
        write: (function(stream, buffer, offset, length, pos) {
            if (!stream.tty || !stream.tty.ops.put_char) {
                throw new FS.ErrnoError(ERRNO_CODES.ENXIO)
            }
            for (var i = 0; i < length; i++) {
                try {
                    stream.tty.ops.put_char(stream.tty, buffer[offset + i])
                } catch (e) {
                    throw new FS.ErrnoError(ERRNO_CODES.EIO)
                }
            }
            if (length) {
                stream.node.timestamp = Date.now()
            }
            return i
        })
    },
    default_tty_ops: {
        get_char: (function(tty) {
            if (!tty.input.length) {
                var result = null;
                if (ENVIRONMENT_IS_NODE) {
                    var BUFSIZE = 256;
                    var buf = new Buffer(BUFSIZE);
                    var bytesRead = 0;
                    var isPosixPlatform = process.platform != "win32";
                    var fd = process.stdin.fd;
                    if (isPosixPlatform) {
                        var usingDevice = false;
                        try {
                            fd = fs.openSync("/dev/stdin", "r");
                            usingDevice = true
                        } catch (e) {}
                    }
                    try {
                        bytesRead = fs.readSync(fd, buf, 0, BUFSIZE, null)
                    } catch (e) {
                        if (e.toString().indexOf("EOF") != -1) bytesRead = 0;
                        else throw e
                    }
                    if (usingDevice) {
                        fs.closeSync(fd)
                    }
                    if (bytesRead > 0) {
                        result = buf.slice(0, bytesRead).toString("utf-8")
                    } else {
                        result = null
                    }
                } else if (typeof window != "undefined" && typeof window.prompt == "function") {
                    result = window.prompt("Input: ");
                    if (result !== null) {
                        result += "\n"
                    }
                } else if (typeof readline == "function") {
                    result = readline();
                    if (result !== null) {
                        result += "\n"
                    }
                }
                if (!result) {
                    return null
                }
                tty.input = intArrayFromString(result, true)
            }
            return tty.input.shift()
        }),
        put_char: (function(tty, val) {
            if (val === null || val === 10) {
                Module["print"](UTF8ArrayToString(tty.output, 0));
                tty.output = []
            } else {
                if (val != 0) tty.output.push(val)
            }
        }),
        flush: (function(tty) {
            if (tty.output && tty.output.length > 0) {
                Module["print"](UTF8ArrayToString(tty.output, 0));
                tty.output = []
            }
        })
    },
    default_tty1_ops: {
        put_char: (function(tty, val) {
            if (val === null || val === 10) {
                Module["printErr"](UTF8ArrayToString(tty.output, 0));
                tty.output = []
            } else {
                if (val != 0) tty.output.push(val)
            }
        }),
        flush: (function(tty) {
            if (tty.output && tty.output.length > 0) {
                Module["printErr"](UTF8ArrayToString(tty.output, 0));
                tty.output = []
            }
        })
    }
};
var MEMFS = {
    ops_table: null,
    mount: (function(mount) {
        return MEMFS.createNode(null, "/", 16384 | 511, 0)
    }),
    createNode: (function(parent, name, mode, dev) {
        if (FS.isBlkdev(mode) || FS.isFIFO(mode)) {
            throw new FS.ErrnoError(ERRNO_CODES.EPERM)
        }
        if (!MEMFS.ops_table) {
            MEMFS.ops_table = {
                dir: {
                    node: {
                        getattr: MEMFS.node_ops.getattr,
                        setattr: MEMFS.node_ops.setattr,
                        lookup: MEMFS.node_ops.lookup,
                        mknod: MEMFS.node_ops.mknod,
                        rename: MEMFS.node_ops.rename,
                        unlink: MEMFS.node_ops.unlink,
                        rmdir: MEMFS.node_ops.rmdir,
                        readdir: MEMFS.node_ops.readdir,
                        symlink: MEMFS.node_ops.symlink
                    },
                    stream: {
                        llseek: MEMFS.stream_ops.llseek
                    }
                },
                file: {
                    node: {
                        getattr: MEMFS.node_ops.getattr,
                        setattr: MEMFS.node_ops.setattr
                    },
                    stream: {
                        llseek: MEMFS.stream_ops.llseek,
                        read: MEMFS.stream_ops.read,
                        write: MEMFS.stream_ops.write,
                        allocate: MEMFS.stream_ops.allocate,
                        mmap: MEMFS.stream_ops.mmap,
                        msync: MEMFS.stream_ops.msync
                    }
                },
                link: {
                    node: {
                        getattr: MEMFS.node_ops.getattr,
                        setattr: MEMFS.node_ops.setattr,
                        readlink: MEMFS.node_ops.readlink
                    },
                    stream: {}
                },
                chrdev: {
                    node: {
                        getattr: MEMFS.node_ops.getattr,
                        setattr: MEMFS.node_ops.setattr
                    },
                    stream: FS.chrdev_stream_ops
                }
            }
        }
        var node = FS.createNode(parent, name, mode, dev);
        if (FS.isDir(node.mode)) {
            node.node_ops = MEMFS.ops_table.dir.node;
            node.stream_ops = MEMFS.ops_table.dir.stream;
            node.contents = {}
        } else if (FS.isFile(node.mode)) {
            node.node_ops = MEMFS.ops_table.file.node;
            node.stream_ops = MEMFS.ops_table.file.stream;
            node.usedBytes = 0;
            node.contents = null
        } else if (FS.isLink(node.mode)) {
            node.node_ops = MEMFS.ops_table.link.node;
            node.stream_ops = MEMFS.ops_table.link.stream
        } else if (FS.isChrdev(node.mode)) {
            node.node_ops = MEMFS.ops_table.chrdev.node;
            node.stream_ops = MEMFS.ops_table.chrdev.stream
        }
        node.timestamp = Date.now();
        if (parent) {
            parent.contents[name] = node
        }
        return node
    }),
    getFileDataAsRegularArray: (function(node) {
        if (node.contents && node.contents.subarray) {
            var arr = [];
            for (var i = 0; i < node.usedBytes; ++i) arr.push(node.contents[i]);
            return arr
        }
        return node.contents
    }),
    getFileDataAsTypedArray: (function(node) {
        if (!node.contents) return new Uint8Array;
        if (node.contents.subarray) return node.contents.subarray(0, node.usedBytes);
        return new Uint8Array(node.contents)
    }),
    expandFileStorage: (function(node, newCapacity) {
        if (node.contents && node.contents.subarray && newCapacity > node.contents.length) {
            node.contents = MEMFS.getFileDataAsRegularArray(node);
            node.usedBytes = node.contents.length
        }
        if (!node.contents || node.contents.subarray) {
            var prevCapacity = node.contents ? node.contents.length : 0;
            if (prevCapacity >= newCapacity) return;
            var CAPACITY_DOUBLING_MAX = 1024 * 1024;
            newCapacity = Math.max(newCapacity, prevCapacity * (prevCapacity < CAPACITY_DOUBLING_MAX ? 2 : 1.125) | 0);
            if (prevCapacity != 0) newCapacity = Math.max(newCapacity, 256);
            var oldContents = node.contents;
            node.contents = new Uint8Array(newCapacity);
            if (node.usedBytes > 0) node.contents.set(oldContents.subarray(0, node.usedBytes), 0);
            return
        }
        if (!node.contents && newCapacity > 0) node.contents = [];
        while (node.contents.length < newCapacity) node.contents.push(0)
    }),
    resizeFileStorage: (function(node, newSize) {
        if (node.usedBytes == newSize) return;
        if (newSize == 0) {
            node.contents = null;
            node.usedBytes = 0;
            return
        }
        if (!node.contents || node.contents.subarray) {
            var oldContents = node.contents;
            node.contents = new Uint8Array(new ArrayBuffer(newSize));
            if (oldContents) {
                node.contents.set(oldContents.subarray(0, Math.min(newSize, node.usedBytes)))
            }
            node.usedBytes = newSize;
            return
        }
        if (!node.contents) node.contents = [];
        if (node.contents.length > newSize) node.contents.length = newSize;
        else
            while (node.contents.length < newSize) node.contents.push(0);
        node.usedBytes = newSize
    }),
    node_ops: {
        getattr: (function(node) {
            var attr = {};
            attr.dev = FS.isChrdev(node.mode) ? node.id : 1;
            attr.ino = node.id;
            attr.mode = node.mode;
            attr.nlink = 1;
            attr.uid = 0;
            attr.gid = 0;
            attr.rdev = node.rdev;
            if (FS.isDir(node.mode)) {
                attr.size = 4096
            } else if (FS.isFile(node.mode)) {
                attr.size = node.usedBytes
            } else if (FS.isLink(node.mode)) {
                attr.size = node.link.length
            } else {
                attr.size = 0
            }
            attr.atime = new Date(node.timestamp);
            attr.mtime = new Date(node.timestamp);
            attr.ctime = new Date(node.timestamp);
            attr.blksize = 4096;
            attr.blocks = Math.ceil(attr.size / attr.blksize);
            return attr
        }),
        setattr: (function(node, attr) {
            if (attr.mode !== undefined) {
                node.mode = attr.mode
            }
            if (attr.timestamp !== undefined) {
                node.timestamp = attr.timestamp
            }
            if (attr.size !== undefined) {
                MEMFS.resizeFileStorage(node, attr.size)
            }
        }),
        lookup: (function(parent, name) {
            throw FS.genericErrors[ERRNO_CODES.ENOENT]
        }),
        mknod: (function(parent, name, mode, dev) {
            return MEMFS.createNode(parent, name, mode, dev)
        }),
        rename: (function(old_node, new_dir, new_name) {
            if (FS.isDir(old_node.mode)) {
                var new_node;
                try {
                    new_node = FS.lookupNode(new_dir, new_name)
                } catch (e) {}
                if (new_node) {
                    for (var i in new_node.contents) {
                        throw new FS.ErrnoError(ERRNO_CODES.ENOTEMPTY)
                    }
                }
            }
            delete old_node.parent.contents[old_node.name];
            old_node.name = new_name;
            new_dir.contents[new_name] = old_node;
            old_node.parent = new_dir
        }),
        unlink: (function(parent, name) {
            delete parent.contents[name]
        }),
        rmdir: (function(parent, name) {
            var node = FS.lookupNode(parent, name);
            for (var i in node.contents) {
                throw new FS.ErrnoError(ERRNO_CODES.ENOTEMPTY)
            }
            delete parent.contents[name]
        }),
        readdir: (function(node) {
            var entries = [".", ".."];
            for (var key in node.contents) {
                if (!node.contents.hasOwnProperty(key)) {
                    continue
                }
                entries.push(key)
            }
            return entries
        }),
        symlink: (function(parent, newname, oldpath) {
            var node = MEMFS.createNode(parent, newname, 511 | 40960, 0);
            node.link = oldpath;
            return node
        }),
        readlink: (function(node) {
            if (!FS.isLink(node.mode)) {
                throw new FS.ErrnoError(ERRNO_CODES.EINVAL)
            }
            return node.link
        })
    },
    stream_ops: {
        read: (function(stream, buffer, offset, length, position) {
            var contents = stream.node.contents;
            if (position >= stream.node.usedBytes) return 0;
            var size = Math.min(stream.node.usedBytes - position, length);
            assert(size >= 0);
            if (size > 8 && contents.subarray) {
                buffer.set(contents.subarray(position, position + size), offset)
            } else {
                for (var i = 0; i < size; i++) buffer[offset + i] = contents[position + i]
            }
            return size
        }),
        write: (function(stream, buffer, offset, length, position, canOwn) {
            if (!length) return 0;
            var node = stream.node;
            node.timestamp = Date.now();
            if (buffer.subarray && (!node.contents || node.contents.subarray)) {
                if (canOwn) {
                    node.contents = buffer.subarray(offset, offset + length);
                    node.usedBytes = length;
                    return length
                } else if (node.usedBytes === 0 && position === 0) {
                    node.contents = new Uint8Array(buffer.subarray(offset, offset + length));
                    node.usedBytes = length;
                    return length
                } else if (position + length <= node.usedBytes) {
                    node.contents.set(buffer.subarray(offset, offset + length), position);
                    return length
                }
            }
            MEMFS.expandFileStorage(node, position + length);
            if (node.contents.subarray && buffer.subarray) node.contents.set(buffer.subarray(offset, offset + length), position);
            else {
                for (var i = 0; i < length; i++) {
                    node.contents[position + i] = buffer[offset + i]
                }
            }
            node.usedBytes = Math.max(node.usedBytes, position + length);
            return length
        }),
        llseek: (function(stream, offset, whence) {
            var position = offset;
            if (whence === 1) {
                position += stream.position
            } else if (whence === 2) {
                if (FS.isFile(stream.node.mode)) {
                    position += stream.node.usedBytes
                }
            }
            if (position < 0) {
                throw new FS.ErrnoError(ERRNO_CODES.EINVAL)
            }
            return position
        }),
        allocate: (function(stream, offset, length) {
            MEMFS.expandFileStorage(stream.node, offset + length);
            stream.node.usedBytes = Math.max(stream.node.usedBytes, offset + length)
        }),
        mmap: (function(stream, buffer, offset, length, position, prot, flags) {
            if (!FS.isFile(stream.node.mode)) {
                throw new FS.ErrnoError(ERRNO_CODES.ENODEV)
            }
            var ptr;
            var allocated;
            var contents = stream.node.contents;
            if (!(flags & 2) && (contents.buffer === buffer || contents.buffer === buffer.buffer)) {
                allocated = false;
                ptr = contents.byteOffset
            } else {
                if (position > 0 || position + length < stream.node.usedBytes) {
                    if (contents.subarray) {
                        contents = contents.subarray(position, position + length)
                    } else {
                        contents = Array.prototype.slice.call(contents, position, position + length)
                    }
                }
                allocated = true;
                ptr = _malloc(length);
                if (!ptr) {
                    throw new FS.ErrnoError(ERRNO_CODES.ENOMEM)
                }
                buffer.set(contents, ptr)
            }
            return {
                ptr: ptr,
                allocated: allocated
            }
        }),
        msync: (function(stream, buffer, offset, length, mmapFlags) {
            if (!FS.isFile(stream.node.mode)) {
                throw new FS.ErrnoError(ERRNO_CODES.ENODEV)
            }
            if (mmapFlags & 2) {
                return 0
            }
            var bytesWritten = MEMFS.stream_ops.write(stream, buffer, 0, length, offset, false);
            return 0
        })
    }
};
var IDBFS = {
    dbs: {},
    indexedDB: (function() {
        if (typeof indexedDB !== "undefined") return indexedDB;
        var ret = null;
        if (typeof window === "object") ret = window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB;
        assert(ret, "IDBFS used, but indexedDB not supported");
        return ret
    }),
    DB_VERSION: 21,
    DB_STORE_NAME: "FILE_DATA",
    mount: (function(mount) {
        return MEMFS.mount.apply(null, arguments)
    }),
    syncfs: (function(mount, populate, callback) {
        IDBFS.getLocalSet(mount, (function(err, local) {
            if (err) return callback(err);
            IDBFS.getRemoteSet(mount, (function(err, remote) {
                if (err) return callback(err);
                var src = populate ? remote : local;
                var dst = populate ? local : remote;
                IDBFS.reconcile(src, dst, callback)
            }))
        }))
    }),
    getDB: (function(name, callback) {
        var db = IDBFS.dbs[name];
        if (db) {
            return callback(null, db)
        }
        var req;
        try {
            req = IDBFS.indexedDB().open(name, IDBFS.DB_VERSION)
        } catch (e) {
            return callback(e)
        }
        if (!req) {
            return callback("Unable to connect to IndexedDB")
        }
        req.onupgradeneeded = (function(e) {
            var db = e.target.result;
            var transaction = e.target.transaction;
            var fileStore;
            if (db.objectStoreNames.contains(IDBFS.DB_STORE_NAME)) {
                fileStore = transaction.objectStore(IDBFS.DB_STORE_NAME)
            } else {
                fileStore = db.createObjectStore(IDBFS.DB_STORE_NAME)
            }
            if (!fileStore.indexNames.contains("timestamp")) {
                fileStore.createIndex("timestamp", "timestamp", {
                    unique: false
                })
            }
        });
        req.onsuccess = (function() {
            db = req.result;
            IDBFS.dbs[name] = db;
            callback(null, db)
        });
        req.onerror = (function(e) {
            callback(this.error);
            e.preventDefault()
        })
    }),
    getLocalSet: (function(mount, callback) {
        var entries = {};

        function isRealDir(p) {
            return p !== "." && p !== ".."
        }

        function toAbsolute(root) {
            return (function(p) {
                return PATH.join2(root, p)
            })
        }
        var check = FS.readdir(mount.mountpoint).filter(isRealDir).map(toAbsolute(mount.mountpoint));
        while (check.length) {
            var path = check.pop();
            var stat;
            try {
                stat = FS.stat(path)
            } catch (e) {
                return callback(e)
            }
            if (FS.isDir(stat.mode)) {
                check.push.apply(check, FS.readdir(path).filter(isRealDir).map(toAbsolute(path)))
            }
            entries[path] = {
                timestamp: stat.mtime
            }
        }
        return callback(null, {
            type: "local",
            entries: entries
        })
    }),
    getRemoteSet: (function(mount, callback) {
        var entries = {};
        IDBFS.getDB(mount.mountpoint, (function(err, db) {
            if (err) return callback(err);
            try {
                var transaction = db.transaction([IDBFS.DB_STORE_NAME], "readonly");
                transaction.onerror = (function(e) {
                    callback(this.error);
                    e.preventDefault()
                });
                var store = transaction.objectStore(IDBFS.DB_STORE_NAME);
                var index = store.index("timestamp");
                index.openKeyCursor().onsuccess = (function(event) {
                    var cursor = event.target.result;
                    if (!cursor) {
                        return callback(null, {
                            type: "remote",
                            db: db,
                            entries: entries
                        })
                    }
                    entries[cursor.primaryKey] = {
                        timestamp: cursor.key
                    };
                    cursor.continue()
                })
            } catch (e) {
                return callback(e)
            }
        }))
    }),
    loadLocalEntry: (function(path, callback) {
        var stat, node;
        try {
            var lookup = FS.lookupPath(path);
            node = lookup.node;
            stat = FS.stat(path)
        } catch (e) {
            return callback(e)
        }
        if (FS.isDir(stat.mode)) {
            return callback(null, {
                timestamp: stat.mtime,
                mode: stat.mode
            })
        } else if (FS.isFile(stat.mode)) {
            node.contents = MEMFS.getFileDataAsTypedArray(node);
            return callback(null, {
                timestamp: stat.mtime,
                mode: stat.mode,
                contents: node.contents
            })
        } else {
            return callback(new Error("node type not supported"))
        }
    }),
    storeLocalEntry: (function(path, entry, callback) {
        try {
            if (FS.isDir(entry.mode)) {
                FS.mkdir(path, entry.mode)
            } else if (FS.isFile(entry.mode)) {
                FS.writeFile(path, entry.contents, {
                    encoding: "binary",
                    canOwn: true
                })
            } else {
                return callback(new Error("node type not supported"))
            }
            FS.chmod(path, entry.mode);
            FS.utime(path, entry.timestamp, entry.timestamp)
        } catch (e) {
            return callback(e)
        }
        callback(null)
    }),
    removeLocalEntry: (function(path, callback) {
        try {
            var lookup = FS.lookupPath(path);
            var stat = FS.stat(path);
            if (FS.isDir(stat.mode)) {
                FS.rmdir(path)
            } else if (FS.isFile(stat.mode)) {
                FS.unlink(path)
            }
        } catch (e) {
            return callback(e)
        }
        callback(null)
    }),
    loadRemoteEntry: (function(store, path, callback) {
        var req = store.get(path);
        req.onsuccess = (function(event) {
            callback(null, event.target.result)
        });
        req.onerror = (function(e) {
            callback(this.error);
            e.preventDefault()
        })
    }),
    storeRemoteEntry: (function(store, path, entry, callback) {
        var req = store.put(entry, path);
        req.onsuccess = (function() {
            callback(null)
        });
        req.onerror = (function(e) {
            callback(this.error);
            e.preventDefault()
        })
    }),
    removeRemoteEntry: (function(store, path, callback) {
        var req = store.delete(path);
        req.onsuccess = (function() {
            callback(null)
        });
        req.onerror = (function(e) {
            callback(this.error);
            e.preventDefault()
        })
    }),
    reconcile: (function(src, dst, callback) {
        var total = 0;
        var create = [];
        Object.keys(src.entries).forEach((function(key) {
            var e = src.entries[key];
            var e2 = dst.entries[key];
            if (!e2 || e.timestamp > e2.timestamp) {
                create.push(key);
                total++
            }
        }));
        var remove = [];
        Object.keys(dst.entries).forEach((function(key) {
            var e = dst.entries[key];
            var e2 = src.entries[key];
            if (!e2) {
                remove.push(key);
                total++
            }
        }));
        if (!total) {
            return callback(null)
        }
        var completed = 0;
        var db = src.type === "remote" ? src.db : dst.db;
        var transaction = db.transaction([IDBFS.DB_STORE_NAME], "readwrite");
        var store = transaction.objectStore(IDBFS.DB_STORE_NAME);

        function done(err) {
            if (err) {
                if (!done.errored) {
                    done.errored = true;
                    return callback(err)
                }
                return
            }
            if (++completed >= total) {
                return callback(null)
            }
        }
        transaction.onerror = (function(e) {
            done(this.error);
            e.preventDefault()
        });
        create.sort().forEach((function(path) {
            if (dst.type === "local") {
                IDBFS.loadRemoteEntry(store, path, (function(err, entry) {
                    if (err) return done(err);
                    IDBFS.storeLocalEntry(path, entry, done)
                }))
            } else {
                IDBFS.loadLocalEntry(path, (function(err, entry) {
                    if (err) return done(err);
                    IDBFS.storeRemoteEntry(store, path, entry, done)
                }))
            }
        }));
        remove.sort().reverse().forEach((function(path) {
            if (dst.type === "local") {
                IDBFS.removeLocalEntry(path, done)
            } else {
                IDBFS.removeRemoteEntry(store, path, done)
            }
        }))
    })
};
var NODEFS = {
    isWindows: false,
    staticInit: (function() {
        NODEFS.isWindows = !!process.platform.match(/^win/)
    }),
    mount: (function(mount) {
        assert(ENVIRONMENT_IS_NODE);
        return NODEFS.createNode(null, "/", NODEFS.getMode(mount.opts.root), 0)
    }),
    createNode: (function(parent, name, mode, dev) {
        if (!FS.isDir(mode) && !FS.isFile(mode) && !FS.isLink(mode)) {
            throw new FS.ErrnoError(ERRNO_CODES.EINVAL)
        }
        var node = FS.createNode(parent, name, mode);
        node.node_ops = NODEFS.node_ops;
        node.stream_ops = NODEFS.stream_ops;
        return node
    }),
    getMode: (function(path) {
        var stat;
        try {
            stat = fs.lstatSync(path);
            if (NODEFS.isWindows) {
                stat.mode = stat.mode | (stat.mode & 146) >> 1
            }
        } catch (e) {
            if (!e.code) throw e;
            throw new FS.ErrnoError(ERRNO_CODES[e.code])
        }
        return stat.mode
    }),
    realPath: (function(node) {
        var parts = [];
        while (node.parent !== node) {
            parts.push(node.name);
            node = node.parent
        }
        parts.push(node.mount.opts.root);
        parts.reverse();
        return PATH.join.apply(null, parts)
    }),
    flagsToPermissionStringMap: {
        0: "r",
        1: "r+",
        2: "r+",
        64: "r",
        65: "r+",
        66: "r+",
        129: "rx+",
        193: "rx+",
        514: "w+",
        577: "w",
        578: "w+",
        705: "wx",
        706: "wx+",
        1024: "a",
        1025: "a",
        1026: "a+",
        1089: "a",
        1090: "a+",
        1153: "ax",
        1154: "ax+",
        1217: "ax",
        1218: "ax+",
        4096: "rs",
        4098: "rs+"
    },
    flagsToPermissionString: (function(flags) {
        flags &= ~2097152;
        flags &= ~2048;
        flags &= ~32768;
        flags &= ~524288;
        if (flags in NODEFS.flagsToPermissionStringMap) {
            return NODEFS.flagsToPermissionStringMap[flags]
        } else {
            throw new FS.ErrnoError(ERRNO_CODES.EINVAL)
        }
    }),
    node_ops: {
        getattr: (function(node) {
            var path = NODEFS.realPath(node);
            var stat;
            try {
                stat = fs.lstatSync(path)
            } catch (e) {
                if (!e.code) throw e;
                throw new FS.ErrnoError(ERRNO_CODES[e.code])
            }
            if (NODEFS.isWindows && !stat.blksize) {
                stat.blksize = 4096
            }
            if (NODEFS.isWindows && !stat.blocks) {
                stat.blocks = (stat.size + stat.blksize - 1) / stat.blksize | 0
            }
            return {
                dev: stat.dev,
                ino: stat.ino,
                mode: stat.mode,
                nlink: stat.nlink,
                uid: stat.uid,
                gid: stat.gid,
                rdev: stat.rdev,
                size: stat.size,
                atime: stat.atime,
                mtime: stat.mtime,
                ctime: stat.ctime,
                blksize: stat.blksize,
                blocks: stat.blocks
            }
        }),
        setattr: (function(node, attr) {
            var path = NODEFS.realPath(node);
            try {
                if (attr.mode !== undefined) {
                    fs.chmodSync(path, attr.mode);
                    node.mode = attr.mode
                }
                if (attr.timestamp !== undefined) {
                    var date = new Date(attr.timestamp);
                    fs.utimesSync(path, date, date)
                }
                if (attr.size !== undefined) {
                    fs.truncateSync(path, attr.size)
                }
            } catch (e) {
                if (!e.code) throw e;
                throw new FS.ErrnoError(ERRNO_CODES[e.code])
            }
        }),
        lookup: (function(parent, name) {
            var path = PATH.join2(NODEFS.realPath(parent), name);
            var mode = NODEFS.getMode(path);
            return NODEFS.createNode(parent, name, mode)
        }),
        mknod: (function(parent, name, mode, dev) {
            var node = NODEFS.createNode(parent, name, mode, dev);
            var path = NODEFS.realPath(node);
            try {
                if (FS.isDir(node.mode)) {
                    fs.mkdirSync(path, node.mode)
                } else {
                    fs.writeFileSync(path, "", {
                        mode: node.mode
                    })
                }
            } catch (e) {
                if (!e.code) throw e;
                throw new FS.ErrnoError(ERRNO_CODES[e.code])
            }
            return node
        }),
        rename: (function(oldNode, newDir, newName) {
            var oldPath = NODEFS.realPath(oldNode);
            var newPath = PATH.join2(NODEFS.realPath(newDir), newName);
            try {
                fs.renameSync(oldPath, newPath)
            } catch (e) {
                if (!e.code) throw e;
                throw new FS.ErrnoError(ERRNO_CODES[e.code])
            }
        }),
        unlink: (function(parent, name) {
            var path = PATH.join2(NODEFS.realPath(parent), name);
            try {
                fs.unlinkSync(path)
            } catch (e) {
                if (!e.code) throw e;
                throw new FS.ErrnoError(ERRNO_CODES[e.code])
            }
        }),
        rmdir: (function(parent, name) {
            var path = PATH.join2(NODEFS.realPath(parent), name);
            try {
                fs.rmdirSync(path)
            } catch (e) {
                if (!e.code) throw e;
                throw new FS.ErrnoError(ERRNO_CODES[e.code])
            }
        }),
        readdir: (function(node) {
            var path = NODEFS.realPath(node);
            try {
                return fs.readdirSync(path)
            } catch (e) {
                if (!e.code) throw e;
                throw new FS.ErrnoError(ERRNO_CODES[e.code])
            }
        }),
        symlink: (function(parent, newName, oldPath) {
            var newPath = PATH.join2(NODEFS.realPath(parent), newName);
            try {
                fs.symlinkSync(oldPath, newPath)
            } catch (e) {
                if (!e.code) throw e;
                throw new FS.ErrnoError(ERRNO_CODES[e.code])
            }
        }),
        readlink: (function(node) {
            var path = NODEFS.realPath(node);
            try {
                path = fs.readlinkSync(path);
                path = NODEJS_PATH.relative(NODEJS_PATH.resolve(node.mount.opts.root), path);
                return path
            } catch (e) {
                if (!e.code) throw e;
                throw new FS.ErrnoError(ERRNO_CODES[e.code])
            }
        })
    },
    stream_ops: {
        open: (function(stream) {
            var path = NODEFS.realPath(stream.node);
            try {
                if (FS.isFile(stream.node.mode)) {
                    stream.nfd = fs.openSync(path, NODEFS.flagsToPermissionString(stream.flags))
                }
            } catch (e) {
                if (!e.code) throw e;
                throw new FS.ErrnoError(ERRNO_CODES[e.code])
            }
        }),
        close: (function(stream) {
            try {
                if (FS.isFile(stream.node.mode) && stream.nfd) {
                    fs.closeSync(stream.nfd)
                }
            } catch (e) {
                if (!e.code) throw e;
                throw new FS.ErrnoError(ERRNO_CODES[e.code])
            }
        }),
        read: (function(stream, buffer, offset, length, position) {
            if (length === 0) return 0;
            var buf = Buffer.from ? Buffer.from(buffer.buffer) : new Buffer(buffer.buffer);
            try {
                return fs.readSync(stream.nfd, buf, offset, length, position)
            } catch (e) {
                throw new FS.ErrnoError(ERRNO_CODES[e.code])
            }
        }),
        write: (function(stream, buffer, offset, length, position) {
            var buf = Buffer.from ? Buffer.from(buffer.buffer) : new Buffer(buffer.buffer);
            try {
                return fs.writeSync(stream.nfd, buf, offset, length, position)
            } catch (e) {
                throw new FS.ErrnoError(ERRNO_CODES[e.code])
            }
        }),
        llseek: (function(stream, offset, whence) {
            var position = offset;
            if (whence === 1) {
                position += stream.position
            } else if (whence === 2) {
                if (FS.isFile(stream.node.mode)) {
                    try {
                        var stat = fs.fstatSync(stream.nfd);
                        position += stat.size
                    } catch (e) {
                        throw new FS.ErrnoError(ERRNO_CODES[e.code])
                    }
                }
            }
            if (position < 0) {
                throw new FS.ErrnoError(ERRNO_CODES.EINVAL)
            }
            return position
        })
    }
};
var WORKERFS = {
    DIR_MODE: 16895,
    FILE_MODE: 33279,
    reader: null,
    mount: (function(mount) {
        assert(ENVIRONMENT_IS_WORKER);
        if (!WORKERFS.reader) WORKERFS.reader = new FileReaderSync;
        var root = WORKERFS.createNode(null, "/", WORKERFS.DIR_MODE, 0);
        var createdParents = {};

        function ensureParent(path) {
            var parts = path.split("/");
            var parent = root;
            for (var i = 0; i < parts.length - 1; i++) {
                var curr = parts.slice(0, i + 1).join("/");
                if (!createdParents[curr]) {
                    createdParents[curr] = WORKERFS.createNode(parent, parts[i], WORKERFS.DIR_MODE, 0)
                }
                parent = createdParents[curr]
            }
            return parent
        }

        function base(path) {
            var parts = path.split("/");
            return parts[parts.length - 1]
        }
        Array.prototype.forEach.call(mount.opts["files"] || [], (function(file) {
            WORKERFS.createNode(ensureParent(file.name), base(file.name), WORKERFS.FILE_MODE, 0, file, file.lastModifiedDate)
        }));
        (mount.opts["blobs"] || []).forEach((function(obj) {
            WORKERFS.createNode(ensureParent(obj["name"]), base(obj["name"]), WORKERFS.FILE_MODE, 0, obj["data"])
        }));
        (mount.opts["packages"] || []).forEach((function(pack) {
            pack["metadata"].files.forEach((function(file) {
                var name = file.filename.substr(1);
                WORKERFS.createNode(ensureParent(name), base(name), WORKERFS.FILE_MODE, 0, pack["blob"].slice(file.start, file.end))
            }))
        }));
        return root
    }),
    createNode: (function(parent, name, mode, dev, contents, mtime) {
        var node = FS.createNode(parent, name, mode);
        node.mode = mode;
        node.node_ops = WORKERFS.node_ops;
        node.stream_ops = WORKERFS.stream_ops;
        node.timestamp = (mtime || new Date).getTime();
        assert(WORKERFS.FILE_MODE !== WORKERFS.DIR_MODE);
        if (mode === WORKERFS.FILE_MODE) {
            node.size = contents.size;
            node.contents = contents
        } else {
            node.size = 4096;
            node.contents = {}
        }
        if (parent) {
            parent.contents[name] = node
        }
        return node
    }),
    node_ops: {
        getattr: (function(node) {
            return {
                dev: 1,
                ino: undefined,
                mode: node.mode,
                nlink: 1,
                uid: 0,
                gid: 0,
                rdev: undefined,
                size: node.size,
                atime: new Date(node.timestamp),
                mtime: new Date(node.timestamp),
                ctime: new Date(node.timestamp),
                blksize: 4096,
                blocks: Math.ceil(node.size / 4096)
            }
        }),
        setattr: (function(node, attr) {
            if (attr.mode !== undefined) {
                node.mode = attr.mode
            }
            if (attr.timestamp !== undefined) {
                node.timestamp = attr.timestamp
            }
        }),
        lookup: (function(parent, name) {
            throw new FS.ErrnoError(ERRNO_CODES.ENOENT)
        }),
        mknod: (function(parent, name, mode, dev) {
            throw new FS.ErrnoError(ERRNO_CODES.EPERM)
        }),
        rename: (function(oldNode, newDir, newName) {
            throw new FS.ErrnoError(ERRNO_CODES.EPERM)
        }),
        unlink: (function(parent, name) {
            throw new FS.ErrnoError(ERRNO_CODES.EPERM)
        }),
        rmdir: (function(parent, name) {
            throw new FS.ErrnoError(ERRNO_CODES.EPERM)
        }),
        readdir: (function(node) {
            var entries = [".", ".."];
            for (var key in node.contents) {
                if (!node.contents.hasOwnProperty(key)) {
                    continue
                }
                entries.push(key)
            }
            return entries
        }),
        symlink: (function(parent, newName, oldPath) {
            throw new FS.ErrnoError(ERRNO_CODES.EPERM)
        }),
        readlink: (function(node) {
            throw new FS.ErrnoError(ERRNO_CODES.EPERM)
        })
    },
    stream_ops: {
        read: (function(stream, buffer, offset, length, position) {
            if (position >= stream.node.size) return 0;
            var chunk = stream.node.contents.slice(position, position + length);
            var ab = WORKERFS.reader.readAsArrayBuffer(chunk);
            buffer.set(new Uint8Array(ab), offset);
            return chunk.size
        }),
        write: (function(stream, buffer, offset, length, position) {
            throw new FS.ErrnoError(ERRNO_CODES.EIO)
        }),
        llseek: (function(stream, offset, whence) {
            var position = offset;
            if (whence === 1) {
                position += stream.position
            } else if (whence === 2) {
                if (FS.isFile(stream.node.mode)) {
                    position += stream.node.size
                }
            }
            if (position < 0) {
                throw new FS.ErrnoError(ERRNO_CODES.EINVAL)
            }
            return position
        })
    }
};
STATICTOP += 16;
STATICTOP += 16;
STATICTOP += 16;
var FS = {
    root: null,
    mounts: [],
    devices: [null],
    streams: [],
    nextInode: 1,
    nameTable: null,
    currentPath: "/",
    initialized: false,
    ignorePermissions: true,
    trackingDelegate: {},
    tracking: {
        openFlags: {
            READ: 1,
            WRITE: 2
        }
    },
    ErrnoError: null,
    genericErrors: {},
    filesystems: null,
    syncFSRequests: 0,
    handleFSError: (function(e) {
        if (!(e instanceof FS.ErrnoError)) throw e + " : " + stackTrace();
        return ___setErrNo(e.errno)
    }),
    lookupPath: (function(path, opts) {
        path = PATH.resolve(FS.cwd(), path);
        opts = opts || {};
        if (!path) return {
            path: "",
            node: null
        };
        var defaults = {
            follow_mount: true,
            recurse_count: 0
        };
        for (var key in defaults) {
            if (opts[key] === undefined) {
                opts[key] = defaults[key]
            }
        }
        if (opts.recurse_count > 8) {
            throw new FS.ErrnoError(ERRNO_CODES.ELOOP)
        }
        var parts = PATH.normalizeArray(path.split("/").filter((function(p) {
            return !!p
        })), false);
        var current = FS.root;
        var current_path = "/";
        for (var i = 0; i < parts.length; i++) {
            var islast = i === parts.length - 1;
            if (islast && opts.parent) {
                break
            }
            current = FS.lookupNode(current, parts[i]);
            current_path = PATH.join2(current_path, parts[i]);
            if (FS.isMountpoint(current)) {
                if (!islast || islast && opts.follow_mount) {
                    current = current.mounted.root
                }
            }
            if (!islast || opts.follow) {
                var count = 0;
                while (FS.isLink(current.mode)) {
                    var link = FS.readlink(current_path);
                    current_path = PATH.resolve(PATH.dirname(current_path), link);
                    var lookup = FS.lookupPath(current_path, {
                        recurse_count: opts.recurse_count
                    });
                    current = lookup.node;
                    if (count++ > 40) {
                        throw new FS.ErrnoError(ERRNO_CODES.ELOOP)
                    }
                }
            }
        }
        return {
            path: current_path,
            node: current
        }
    }),
    getPath: (function(node) {
        var path;
        while (true) {
            if (FS.isRoot(node)) {
                var mount = node.mount.mountpoint;
                if (!path) return mount;
                return mount[mount.length - 1] !== "/" ? mount + "/" + path : mount + path
            }
            path = path ? node.name + "/" + path : node.name;
            node = node.parent
        }
    }),
    hashName: (function(parentid, name) {
        var hash = 0;
        for (var i = 0; i < name.length; i++) {
            hash = (hash << 5) - hash + name.charCodeAt(i) | 0
        }
        return (parentid + hash >>> 0) % FS.nameTable.length
    }),
    hashAddNode: (function(node) {
        var hash = FS.hashName(node.parent.id, node.name);
        node.name_next = FS.nameTable[hash];
        FS.nameTable[hash] = node
    }),
    hashRemoveNode: (function(node) {
        var hash = FS.hashName(node.parent.id, node.name);
        if (FS.nameTable[hash] === node) {
            FS.nameTable[hash] = node.name_next
        } else {
            var current = FS.nameTable[hash];
            while (current) {
                if (current.name_next === node) {
                    current.name_next = node.name_next;
                    break
                }
                current = current.name_next
            }
        }
    }),
    lookupNode: (function(parent, name) {
        var err = FS.mayLookup(parent);
        if (err) {
            throw new FS.ErrnoError(err, parent)
        }
        var hash = FS.hashName(parent.id, name);
        for (var node = FS.nameTable[hash]; node; node = node.name_next) {
            var nodeName = node.name;
            if (node.parent.id === parent.id && nodeName === name) {
                return node
            }
        }
        return FS.lookup(parent, name)
    }),
    createNode: (function(parent, name, mode, rdev) {
        if (!FS.FSNode) {
            FS.FSNode = (function(parent, name, mode, rdev) {
                if (!parent) {
                    parent = this
                }
                this.parent = parent;
                this.mount = parent.mount;
                this.mounted = null;
                this.id = FS.nextInode++;
                this.name = name;
                this.mode = mode;
                this.node_ops = {};
                this.stream_ops = {};
                this.rdev = rdev
            });
            FS.FSNode.prototype = {};
            var readMode = 292 | 73;
            var writeMode = 146;
            Object.defineProperties(FS.FSNode.prototype, {
                read: {
                    get: (function() {
                        return (this.mode & readMode) === readMode
                    }),
                    set: (function(val) {
                        val ? this.mode |= readMode : this.mode &= ~readMode
                    })
                },
                write: {
                    get: (function() {
                        return (this.mode & writeMode) === writeMode
                    }),
                    set: (function(val) {
                        val ? this.mode |= writeMode : this.mode &= ~writeMode
                    })
                },
                isFolder: {
                    get: (function() {
                        return FS.isDir(this.mode)
                    })
                },
                isDevice: {
                    get: (function() {
                        return FS.isChrdev(this.mode)
                    })
                }
            })
        }
        var node = new FS.FSNode(parent, name, mode, rdev);
        FS.hashAddNode(node);
        return node
    }),
    destroyNode: (function(node) {
        FS.hashRemoveNode(node)
    }),
    isRoot: (function(node) {
        return node === node.parent
    }),
    isMountpoint: (function(node) {
        return !!node.mounted
    }),
    isFile: (function(mode) {
        return (mode & 61440) === 32768
    }),
    isDir: (function(mode) {
        return (mode & 61440) === 16384
    }),
    isLink: (function(mode) {
        return (mode & 61440) === 40960
    }),
    isChrdev: (function(mode) {
        return (mode & 61440) === 8192
    }),
    isBlkdev: (function(mode) {
        return (mode & 61440) === 24576
    }),
    isFIFO: (function(mode) {
        return (mode & 61440) === 4096
    }),
    isSocket: (function(mode) {
        return (mode & 49152) === 49152
    }),
    flagModes: {
        "r": 0,
        "rs": 1052672,
        "r+": 2,
        "w": 577,
        "wx": 705,
        "xw": 705,
        "w+": 578,
        "wx+": 706,
        "xw+": 706,
        "a": 1089,
        "ax": 1217,
        "xa": 1217,
        "a+": 1090,
        "ax+": 1218,
        "xa+": 1218
    },
    modeStringToFlags: (function(str) {
        var flags = FS.flagModes[str];
        if (typeof flags === "undefined") {
            throw new Error("Unknown file open mode: " + str)
        }
        return flags
    }),
    flagsToPermissionString: (function(flag) {
        var perms = ["r", "w", "rw"][flag & 3];
        if (flag & 512) {
            perms += "w"
        }
        return perms
    }),
    nodePermissions: (function(node, perms) {
        if (FS.ignorePermissions) {
            return 0
        }
        if (perms.indexOf("r") !== -1 && !(node.mode & 292)) {
            return ERRNO_CODES.EACCES
        } else if (perms.indexOf("w") !== -1 && !(node.mode & 146)) {
            return ERRNO_CODES.EACCES
        } else if (perms.indexOf("x") !== -1 && !(node.mode & 73)) {
            return ERRNO_CODES.EACCES
        }
        return 0
    }),
    mayLookup: (function(dir) {
        var err = FS.nodePermissions(dir, "x");
        if (err) return err;
        if (!dir.node_ops.lookup) return ERRNO_CODES.EACCES;
        return 0
    }),
    mayCreate: (function(dir, name) {
        try {
            var node = FS.lookupNode(dir, name);
            return ERRNO_CODES.EEXIST
        } catch (e) {}
        return FS.nodePermissions(dir, "wx")
    }),
    mayDelete: (function(dir, name, isdir) {
        var node;
        try {
            node = FS.lookupNode(dir, name)
        } catch (e) {
            return e.errno
        }
        var err = FS.nodePermissions(dir, "wx");
        if (err) {
            return err
        }
        if (isdir) {
            if (!FS.isDir(node.mode)) {
                return ERRNO_CODES.ENOTDIR
            }
            if (FS.isRoot(node) || FS.getPath(node) === FS.cwd()) {
                return ERRNO_CODES.EBUSY
            }
        } else {
            if (FS.isDir(node.mode)) {
                return ERRNO_CODES.EISDIR
            }
        }
        return 0
    }),
    mayOpen: (function(node, flags) {
        if (!node) {
            return ERRNO_CODES.ENOENT
        }
        if (FS.isLink(node.mode)) {
            return ERRNO_CODES.ELOOP
        } else if (FS.isDir(node.mode)) {
            if (FS.flagsToPermissionString(flags) !== "r" || flags & 512) {
                return ERRNO_CODES.EISDIR
            }
        }
        return FS.nodePermissions(node, FS.flagsToPermissionString(flags))
    }),
    MAX_OPEN_FDS: 4096,
    nextfd: (function(fd_start, fd_end) {
        fd_start = fd_start || 0;
        fd_end = fd_end || FS.MAX_OPEN_FDS;
        for (var fd = fd_start; fd <= fd_end; fd++) {
            if (!FS.streams[fd]) {
                return fd
            }
        }
        throw new FS.ErrnoError(ERRNO_CODES.EMFILE)
    }),
    getStream: (function(fd) {
        return FS.streams[fd]
    }),
    createStream: (function(stream, fd_start, fd_end) {
        if (!FS.FSStream) {
            FS.FSStream = (function() {});
            FS.FSStream.prototype = {};
            Object.defineProperties(FS.FSStream.prototype, {
                object: {
                    get: (function() {
                        return this.node
                    }),
                    set: (function(val) {
                        this.node = val
                    })
                },
                isRead: {
                    get: (function() {
                        return (this.flags & 2097155) !== 1
                    })
                },
                isWrite: {
                    get: (function() {
                        return (this.flags & 2097155) !== 0
                    })
                },
                isAppend: {
                    get: (function() {
                        return this.flags & 1024
                    })
                }
            })
        }
        var newStream = new FS.FSStream;
        for (var p in stream) {
            newStream[p] = stream[p]
        }
        stream = newStream;
        var fd = FS.nextfd(fd_start, fd_end);
        stream.fd = fd;
        FS.streams[fd] = stream;
        return stream
    }),
    closeStream: (function(fd) {
        FS.streams[fd] = null
    }),
    chrdev_stream_ops: {
        open: (function(stream) {
            var device = FS.getDevice(stream.node.rdev);
            stream.stream_ops = device.stream_ops;
            if (stream.stream_ops.open) {
                stream.stream_ops.open(stream)
            }
        }),
        llseek: (function() {
            throw new FS.ErrnoError(ERRNO_CODES.ESPIPE)
        })
    },
    major: (function(dev) {
        return dev >> 8
    }),
    minor: (function(dev) {
        return dev & 255
    }),
    makedev: (function(ma, mi) {
        return ma << 8 | mi
    }),
    registerDevice: (function(dev, ops) {
        FS.devices[dev] = {
            stream_ops: ops
        }
    }),
    getDevice: (function(dev) {
        return FS.devices[dev]
    }),
    getMounts: (function(mount) {
        var mounts = [];
        var check = [mount];
        while (check.length) {
            var m = check.pop();
            mounts.push(m);
            check.push.apply(check, m.mounts)
        }
        return mounts
    }),
    syncfs: (function(populate, callback) {
        if (typeof populate === "function") {
            callback = populate;
            populate = false
        }
        FS.syncFSRequests++;
        if (FS.syncFSRequests > 1) {
            console.log("warning: " + FS.syncFSRequests + " FS.syncfs operations in flight at once, probably just doing extra work")
        }
        var mounts = FS.getMounts(FS.root.mount);
        var completed = 0;

        function doCallback(err) {
            assert(FS.syncFSRequests > 0);
            FS.syncFSRequests--;
            return callback(err)
        }

        function done(err) {
            if (err) {
                if (!done.errored) {
                    done.errored = true;
                    return doCallback(err)
                }
                return
            }
            if (++completed >= mounts.length) {
                doCallback(null)
            }
        }
        mounts.forEach((function(mount) {
            if (!mount.type.syncfs) {
                return done(null)
            }
            mount.type.syncfs(mount, populate, done)
        }))
    }),
    mount: (function(type, opts, mountpoint) {
        var root = mountpoint === "/";
        var pseudo = !mountpoint;
        var node;
        if (root && FS.root) {
            throw new FS.ErrnoError(ERRNO_CODES.EBUSY)
        } else if (!root && !pseudo) {
            var lookup = FS.lookupPath(mountpoint, {
                follow_mount: false
            });
            mountpoint = lookup.path;
            node = lookup.node;
            if (FS.isMountpoint(node)) {
                throw new FS.ErrnoError(ERRNO_CODES.EBUSY)
            }
            if (!FS.isDir(node.mode)) {
                throw new FS.ErrnoError(ERRNO_CODES.ENOTDIR)
            }
        }
        var mount = {
            type: type,
            opts: opts,
            mountpoint: mountpoint,
            mounts: []
        };
        var mountRoot = type.mount(mount);
        mountRoot.mount = mount;
        mount.root = mountRoot;
        if (root) {
            FS.root = mountRoot
        } else if (node) {
            node.mounted = mount;
            if (node.mount) {
                node.mount.mounts.push(mount)
            }
        }
        return mountRoot
    }),
    unmount: (function(mountpoint) {
        var lookup = FS.lookupPath(mountpoint, {
            follow_mount: false
        });
        if (!FS.isMountpoint(lookup.node)) {
            throw new FS.ErrnoError(ERRNO_CODES.EINVAL)
        }
        var node = lookup.node;
        var mount = node.mounted;
        var mounts = FS.getMounts(mount);
        Object.keys(FS.nameTable).forEach((function(hash) {
            var current = FS.nameTable[hash];
            while (current) {
                var next = current.name_next;
                if (mounts.indexOf(current.mount) !== -1) {
                    FS.destroyNode(current)
                }
                current = next
            }
        }));
        node.mounted = null;
        var idx = node.mount.mounts.indexOf(mount);
        assert(idx !== -1);
        node.mount.mounts.splice(idx, 1)
    }),
    lookup: (function(parent, name) {
        return parent.node_ops.lookup(parent, name)
    }),
    mknod: (function(path, mode, dev) {
        var lookup = FS.lookupPath(path, {
            parent: true
        });
        var parent = lookup.node;
        var name = PATH.basename(path);
        if (!name || name === "." || name === "..") {
            throw new FS.ErrnoError(ERRNO_CODES.EINVAL)
        }
        var err = FS.mayCreate(parent, name);
        if (err) {
            throw new FS.ErrnoError(err)
        }
        if (!parent.node_ops.mknod) {
            throw new FS.ErrnoError(ERRNO_CODES.EPERM)
        }
        return parent.node_ops.mknod(parent, name, mode, dev)
    }),
    create: (function(path, mode) {
        mode = mode !== undefined ? mode : 438;
        mode &= 4095;
        mode |= 32768;
        return FS.mknod(path, mode, 0)
    }),
    mkdir: (function(path, mode) {
        mode = mode !== undefined ? mode : 511;
        mode &= 511 | 512;
        mode |= 16384;
        return FS.mknod(path, mode, 0)
    }),
    mkdirTree: (function(path, mode) {
        var dirs = path.split("/");
        var d = "";
        for (var i = 0; i < dirs.length; ++i) {
            if (!dirs[i]) continue;
            d += "/" + dirs[i];
            try {
                FS.mkdir(d, mode)
            } catch (e) {
                if (e.errno != ERRNO_CODES.EEXIST) throw e
            }
        }
    }),
    mkdev: (function(path, mode, dev) {
        if (typeof dev === "undefined") {
            dev = mode;
            mode = 438
        }
        mode |= 8192;
        return FS.mknod(path, mode, dev)
    }),
    symlink: (function(oldpath, newpath) {
        if (!PATH.resolve(oldpath)) {
            throw new FS.ErrnoError(ERRNO_CODES.ENOENT)
        }
        var lookup = FS.lookupPath(newpath, {
            parent: true
        });
        var parent = lookup.node;
        if (!parent) {
            throw new FS.ErrnoError(ERRNO_CODES.ENOENT)
        }
        var newname = PATH.basename(newpath);
        var err = FS.mayCreate(parent, newname);
        if (err) {
            throw new FS.ErrnoError(err)
        }
        if (!parent.node_ops.symlink) {
            throw new FS.ErrnoError(ERRNO_CODES.EPERM)
        }
        return parent.node_ops.symlink(parent, newname, oldpath)
    }),
    rename: (function(old_path, new_path) {
        var old_dirname = PATH.dirname(old_path);
        var new_dirname = PATH.dirname(new_path);
        var old_name = PATH.basename(old_path);
        var new_name = PATH.basename(new_path);
        var lookup, old_dir, new_dir;
        try {
            lookup = FS.lookupPath(old_path, {
                parent: true
            });
            old_dir = lookup.node;
            lookup = FS.lookupPath(new_path, {
                parent: true
            });
            new_dir = lookup.node
        } catch (e) {
            throw new FS.ErrnoError(ERRNO_CODES.EBUSY)
        }
        if (!old_dir || !new_dir) throw new FS.ErrnoError(ERRNO_CODES.ENOENT);
        if (old_dir.mount !== new_dir.mount) {
            throw new FS.ErrnoError(ERRNO_CODES.EXDEV)
        }
        var old_node = FS.lookupNode(old_dir, old_name);
        var relative = PATH.relative(old_path, new_dirname);
        if (relative.charAt(0) !== ".") {
            throw new FS.ErrnoError(ERRNO_CODES.EINVAL)
        }
        relative = PATH.relative(new_path, old_dirname);
        if (relative.charAt(0) !== ".") {
            throw new FS.ErrnoError(ERRNO_CODES.ENOTEMPTY)
        }
        var new_node;
        try {
            new_node = FS.lookupNode(new_dir, new_name)
        } catch (e) {}
        if (old_node === new_node) {
            return
        }
        var isdir = FS.isDir(old_node.mode);
        var err = FS.mayDelete(old_dir, old_name, isdir);
        if (err) {
            throw new FS.ErrnoError(err)
        }
        err = new_node ? FS.mayDelete(new_dir, new_name, isdir) : FS.mayCreate(new_dir, new_name);
        if (err) {
            throw new FS.ErrnoError(err)
        }
        if (!old_dir.node_ops.rename) {
            throw new FS.ErrnoError(ERRNO_CODES.EPERM)
        }
        if (FS.isMountpoint(old_node) || new_node && FS.isMountpoint(new_node)) {
            throw new FS.ErrnoError(ERRNO_CODES.EBUSY)
        }
        if (new_dir !== old_dir) {
            err = FS.nodePermissions(old_dir, "w");
            if (err) {
                throw new FS.ErrnoError(err)
            }
        }
        try {
            if (FS.trackingDelegate["willMovePath"]) {
                FS.trackingDelegate["willMovePath"](old_path, new_path)
            }
        } catch (e) {
            console.log("FS.trackingDelegate['willMovePath']('" + old_path + "', '" + new_path + "') threw an exception: " + e.message)
        }
        FS.hashRemoveNode(old_node);
        try {
            old_dir.node_ops.rename(old_node, new_dir, new_name)
        } catch (e) {
            throw e
        } finally {
            FS.hashAddNode(old_node)
        }
        try {
            if (FS.trackingDelegate["onMovePath"]) FS.trackingDelegate["onMovePath"](old_path, new_path)
        } catch (e) {
            console.log("FS.trackingDelegate['onMovePath']('" + old_path + "', '" + new_path + "') threw an exception: " + e.message)
        }
    }),
    rmdir: (function(path) {
        var lookup = FS.lookupPath(path, {
            parent: true
        });
        var parent = lookup.node;
        var name = PATH.basename(path);
        var node = FS.lookupNode(parent, name);
        var err = FS.mayDelete(parent, name, true);
        if (err) {
            throw new FS.ErrnoError(err)
        }
        if (!parent.node_ops.rmdir) {
            throw new FS.ErrnoError(ERRNO_CODES.EPERM)
        }
        if (FS.isMountpoint(node)) {
            throw new FS.ErrnoError(ERRNO_CODES.EBUSY)
        }
        try {
            if (FS.trackingDelegate["willDeletePath"]) {
                FS.trackingDelegate["willDeletePath"](path)
            }
        } catch (e) {
            console.log("FS.trackingDelegate['willDeletePath']('" + path + "') threw an exception: " + e.message)
        }
        parent.node_ops.rmdir(parent, name);
        FS.destroyNode(node);
        try {
            if (FS.trackingDelegate["onDeletePath"]) FS.trackingDelegate["onDeletePath"](path)
        } catch (e) {
            console.log("FS.trackingDelegate['onDeletePath']('" + path + "') threw an exception: " + e.message)
        }
    }),
    readdir: (function(path) {
        var lookup = FS.lookupPath(path, {
            follow: true
        });
        var node = lookup.node;
        if (!node.node_ops.readdir) {
            throw new FS.ErrnoError(ERRNO_CODES.ENOTDIR)
        }
        return node.node_ops.readdir(node)
    }),
    unlink: (function(path) {
        var lookup = FS.lookupPath(path, {
            parent: true
        });
        var parent = lookup.node;
        var name = PATH.basename(path);
        var node = FS.lookupNode(parent, name);
        var err = FS.mayDelete(parent, name, false);
        if (err) {
            throw new FS.ErrnoError(err)
        }
        if (!parent.node_ops.unlink) {
            throw new FS.ErrnoError(ERRNO_CODES.EPERM)
        }
        if (FS.isMountpoint(node)) {
            throw new FS.ErrnoError(ERRNO_CODES.EBUSY)
        }
        try {
            if (FS.trackingDelegate["willDeletePath"]) {
                FS.trackingDelegate["willDeletePath"](path)
            }
        } catch (e) {
            console.log("FS.trackingDelegate['willDeletePath']('" + path + "') threw an exception: " + e.message)
        }
        parent.node_ops.unlink(parent, name);
        FS.destroyNode(node);
        try {
            if (FS.trackingDelegate["onDeletePath"]) FS.trackingDelegate["onDeletePath"](path)
        } catch (e) {
            console.log("FS.trackingDelegate['onDeletePath']('" + path + "') threw an exception: " + e.message)
        }
    }),
    readlink: (function(path) {
        var lookup = FS.lookupPath(path);
        var link = lookup.node;
        if (!link) {
            throw new FS.ErrnoError(ERRNO_CODES.ENOENT)
        }
        if (!link.node_ops.readlink) {
            throw new FS.ErrnoError(ERRNO_CODES.EINVAL)
        }
        return PATH.resolve(FS.getPath(link.parent), link.node_ops.readlink(link))
    }),
    stat: (function(path, dontFollow) {
        var lookup = FS.lookupPath(path, {
            follow: !dontFollow
        });
        var node = lookup.node;
        if (!node) {
            throw new FS.ErrnoError(ERRNO_CODES.ENOENT)
        }
        if (!node.node_ops.getattr) {
            throw new FS.ErrnoError(ERRNO_CODES.EPERM)
        }
        return node.node_ops.getattr(node)
    }),
    lstat: (function(path) {
        return FS.stat(path, true)
    }),
    chmod: (function(path, mode, dontFollow) {
        var node;
        if (typeof path === "string") {
            var lookup = FS.lookupPath(path, {
                follow: !dontFollow
            });
            node = lookup.node
        } else {
            node = path
        }
        if (!node.node_ops.setattr) {
            throw new FS.ErrnoError(ERRNO_CODES.EPERM)
        }
        node.node_ops.setattr(node, {
            mode: mode & 4095 | node.mode & ~4095,
            timestamp: Date.now()
        })
    }),
    lchmod: (function(path, mode) {
        FS.chmod(path, mode, true)
    }),
    fchmod: (function(fd, mode) {
        var stream = FS.getStream(fd);
        if (!stream) {
            throw new FS.ErrnoError(ERRNO_CODES.EBADF)
        }
        FS.chmod(stream.node, mode)
    }),
    chown: (function(path, uid, gid, dontFollow) {
        var node;
        if (typeof path === "string") {
            var lookup = FS.lookupPath(path, {
                follow: !dontFollow
            });
            node = lookup.node
        } else {
            node = path
        }
        if (!node.node_ops.setattr) {
            throw new FS.ErrnoError(ERRNO_CODES.EPERM)
        }
        node.node_ops.setattr(node, {
            timestamp: Date.now()
        })
    }),
    lchown: (function(path, uid, gid) {
        FS.chown(path, uid, gid, true)
    }),
    fchown: (function(fd, uid, gid) {
        var stream = FS.getStream(fd);
        if (!stream) {
            throw new FS.ErrnoError(ERRNO_CODES.EBADF)
        }
        FS.chown(stream.node, uid, gid)
    }),
    truncate: (function(path, len) {
        if (len < 0) {
            throw new FS.ErrnoError(ERRNO_CODES.EINVAL)
        }
        var node;
        if (typeof path === "string") {
            var lookup = FS.lookupPath(path, {
                follow: true
            });
            node = lookup.node
        } else {
            node = path
        }
        if (!node.node_ops.setattr) {
            throw new FS.ErrnoError(ERRNO_CODES.EPERM)
        }
        if (FS.isDir(node.mode)) {
            throw new FS.ErrnoError(ERRNO_CODES.EISDIR)
        }
        if (!FS.isFile(node.mode)) {
            throw new FS.ErrnoError(ERRNO_CODES.EINVAL)
        }
        var err = FS.nodePermissions(node, "w");
        if (err) {
            throw new FS.ErrnoError(err)
        }
        node.node_ops.setattr(node, {
            size: len,
            timestamp: Date.now()
        })
    }),
    ftruncate: (function(fd, len) {
        var stream = FS.getStream(fd);
        if (!stream) {
            throw new FS.ErrnoError(ERRNO_CODES.EBADF)
        }
        if ((stream.flags & 2097155) === 0) {
            throw new FS.ErrnoError(ERRNO_CODES.EINVAL)
        }
        FS.truncate(stream.node, len)
    }),
    utime: (function(path, atime, mtime) {
        var lookup = FS.lookupPath(path, {
            follow: true
        });
        var node = lookup.node;
        node.node_ops.setattr(node, {
            timestamp: Math.max(atime, mtime)
        })
    }),
    open: (function(path, flags, mode, fd_start, fd_end) {
        if (path === "") {
            throw new FS.ErrnoError(ERRNO_CODES.ENOENT)
        }
        flags = typeof flags === "string" ? FS.modeStringToFlags(flags) : flags;
        mode = typeof mode === "undefined" ? 438 : mode;
        if (flags & 64) {
            mode = mode & 4095 | 32768
        } else {
            mode = 0
        }
        var node;
        if (typeof path === "object") {
            node = path
        } else {
            path = PATH.normalize(path);
            try {
                var lookup = FS.lookupPath(path, {
                    follow: !(flags & 131072)
                });
                node = lookup.node
            } catch (e) {}
        }
        var created = false;
        if (flags & 64) {
            if (node) {
                if (flags & 128) {
                    throw new FS.ErrnoError(ERRNO_CODES.EEXIST)
                }
            } else {
                node = FS.mknod(path, mode, 0);
                created = true
            }
        }
        if (!node) {
            throw new FS.ErrnoError(ERRNO_CODES.ENOENT)
        }
        if (FS.isChrdev(node.mode)) {
            flags &= ~512
        }
        if (flags & 65536 && !FS.isDir(node.mode)) {
            throw new FS.ErrnoError(ERRNO_CODES.ENOTDIR)
        }
        if (!created) {
            var err = FS.mayOpen(node, flags);
            if (err) {
                throw new FS.ErrnoError(err)
            }
        }
        if (flags & 512) {
            FS.truncate(node, 0)
        }
        flags &= ~(128 | 512);
        var stream = FS.createStream({
            node: node,
            path: FS.getPath(node),
            flags: flags,
            seekable: true,
            position: 0,
            stream_ops: node.stream_ops,
            ungotten: [],
            error: false
        }, fd_start, fd_end);
        if (stream.stream_ops.open) {
            stream.stream_ops.open(stream)
        }
        if (Module["logReadFiles"] && !(flags & 1)) {
            if (!FS.readFiles) FS.readFiles = {};
            if (!(path in FS.readFiles)) {
                FS.readFiles[path] = 1;
                Module["printErr"]("read file: " + path)
            }
        }
        try {
            if (FS.trackingDelegate["onOpenFile"]) {
                var trackingFlags = 0;
                if ((flags & 2097155) !== 1) {
                    trackingFlags |= FS.tracking.openFlags.READ
                }
                if ((flags & 2097155) !== 0) {
                    trackingFlags |= FS.tracking.openFlags.WRITE
                }
                FS.trackingDelegate["onOpenFile"](path, trackingFlags)
            }
        } catch (e) {
            console.log("FS.trackingDelegate['onOpenFile']('" + path + "', flags) threw an exception: " + e.message)
        }
        return stream
    }),
    close: (function(stream) {
        if (stream.getdents) stream.getdents = null;
        try {
            if (stream.stream_ops.close) {
                stream.stream_ops.close(stream)
            }
        } catch (e) {
            throw e
        } finally {
            FS.closeStream(stream.fd)
        }
    }),
    llseek: (function(stream, offset, whence) {
        if (!stream.seekable || !stream.stream_ops.llseek) {
            throw new FS.ErrnoError(ERRNO_CODES.ESPIPE)
        }
        stream.position = stream.stream_ops.llseek(stream, offset, whence);
        stream.ungotten = [];
        return stream.position
    }),
    read: (function(stream, buffer, offset, length, position) {
        if (length < 0 || position < 0) {
            throw new FS.ErrnoError(ERRNO_CODES.EINVAL)
        }
        if ((stream.flags & 2097155) === 1) {
            throw new FS.ErrnoError(ERRNO_CODES.EBADF)
        }
        if (FS.isDir(stream.node.mode)) {
            throw new FS.ErrnoError(ERRNO_CODES.EISDIR)
        }
        if (!stream.stream_ops.read) {
            throw new FS.ErrnoError(ERRNO_CODES.EINVAL)
        }
        var seeking = true;
        if (typeof position === "undefined") {
            position = stream.position;
            seeking = false
        } else if (!stream.seekable) {
            throw new FS.ErrnoError(ERRNO_CODES.ESPIPE)
        }
        var bytesRead = stream.stream_ops.read(stream, buffer, offset, length, position);
        if (!seeking) stream.position += bytesRead;
        return bytesRead
    }),
    write: (function(stream, buffer, offset, length, position, canOwn) {
        if (length < 0 || position < 0) {
            throw new FS.ErrnoError(ERRNO_CODES.EINVAL)
        }
        if ((stream.flags & 2097155) === 0) {
            throw new FS.ErrnoError(ERRNO_CODES.EBADF)
        }
        if (FS.isDir(stream.node.mode)) {
            throw new FS.ErrnoError(ERRNO_CODES.EISDIR)
        }
        if (!stream.stream_ops.write) {
            throw new FS.ErrnoError(ERRNO_CODES.EINVAL)
        }
        if (stream.flags & 1024) {
            FS.llseek(stream, 0, 2)
        }
        var seeking = true;
        if (typeof position === "undefined") {
            position = stream.position;
            seeking = false
        } else if (!stream.seekable) {
            throw new FS.ErrnoError(ERRNO_CODES.ESPIPE)
        }
        var bytesWritten = stream.stream_ops.write(stream, buffer, offset, length, position, canOwn);
        if (!seeking) stream.position += bytesWritten;
        try {
            if (stream.path && FS.trackingDelegate["onWriteToFile"]) FS.trackingDelegate["onWriteToFile"](stream.path)
        } catch (e) {
            console.log("FS.trackingDelegate['onWriteToFile']('" + path + "') threw an exception: " + e.message)
        }
        return bytesWritten
    }),
    allocate: (function(stream, offset, length) {
        if (offset < 0 || length <= 0) {
            throw new FS.ErrnoError(ERRNO_CODES.EINVAL)
        }
        if ((stream.flags & 2097155) === 0) {
            throw new FS.ErrnoError(ERRNO_CODES.EBADF)
        }
        if (!FS.isFile(stream.node.mode) && !FS.isDir(stream.node.mode)) {
            throw new FS.ErrnoError(ERRNO_CODES.ENODEV)
        }
        if (!stream.stream_ops.allocate) {
            throw new FS.ErrnoError(ERRNO_CODES.EOPNOTSUPP)
        }
        stream.stream_ops.allocate(stream, offset, length)
    }),
    mmap: (function(stream, buffer, offset, length, position, prot, flags) {
        if ((stream.flags & 2097155) === 1) {
            throw new FS.ErrnoError(ERRNO_CODES.EACCES)
        }
        if (!stream.stream_ops.mmap) {
            throw new FS.ErrnoError(ERRNO_CODES.ENODEV)
        }
        return stream.stream_ops.mmap(stream, buffer, offset, length, position, prot, flags)
    }),
    msync: (function(stream, buffer, offset, length, mmapFlags) {
        if (!stream || !stream.stream_ops.msync) {
            return 0
        }
        return stream.stream_ops.msync(stream, buffer, offset, length, mmapFlags)
    }),
    munmap: (function(stream) {
        return 0
    }),
    ioctl: (function(stream, cmd, arg) {
        if (!stream.stream_ops.ioctl) {
            throw new FS.ErrnoError(ERRNO_CODES.ENOTTY)
        }
        return stream.stream_ops.ioctl(stream, cmd, arg)
    }),
    readFile: (function(path, opts) {
        opts = opts || {};
        opts.flags = opts.flags || "r";
        opts.encoding = opts.encoding || "binary";
        if (opts.encoding !== "utf8" && opts.encoding !== "binary") {
            throw new Error('Invalid encoding type "' + opts.encoding + '"')
        }
        var ret;
        var stream = FS.open(path, opts.flags);
        var stat = FS.stat(path);
        var length = stat.size;
        var buf = new Uint8Array(length);
        FS.read(stream, buf, 0, length, 0);
        if (opts.encoding === "utf8") {
            ret = UTF8ArrayToString(buf, 0)
        } else if (opts.encoding === "binary") {
            ret = buf
        }
        FS.close(stream);
        return ret
    }),
    writeFile: (function(path, data, opts) {
        opts = opts || {};
        opts.flags = opts.flags || "w";
        opts.encoding = opts.encoding || "utf8";
        if (opts.encoding !== "utf8" && opts.encoding !== "binary") {
            throw new Error('Invalid encoding type "' + opts.encoding + '"')
        }
        var stream = FS.open(path, opts.flags, opts.mode);
        if (opts.encoding === "utf8") {
            var buf = new Uint8Array(lengthBytesUTF8(data) + 1);
            var actualNumBytes = stringToUTF8Array(data, buf, 0, buf.length);
            FS.write(stream, buf, 0, actualNumBytes, 0, opts.canOwn)
        } else if (opts.encoding === "binary") {
            FS.write(stream, data, 0, data.length, 0, opts.canOwn)
        }
        FS.close(stream)
    }),
    cwd: (function() {
        return FS.currentPath
    }),
    chdir: (function(path) {
        var lookup = FS.lookupPath(path, {
            follow: true
        });
        if (lookup.node === null) {
            throw new FS.ErrnoError(ERRNO_CODES.ENOENT)
        }
        if (!FS.isDir(lookup.node.mode)) {
            throw new FS.ErrnoError(ERRNO_CODES.ENOTDIR)
        }
        var err = FS.nodePermissions(lookup.node, "x");
        if (err) {
            throw new FS.ErrnoError(err)
        }
        FS.currentPath = lookup.path
    }),
    createDefaultDirectories: (function() {
        FS.mkdir("/tmp");
        FS.mkdir("/home");
        FS.mkdir("/home/web_user")
    }),
    createDefaultDevices: (function() {
        FS.mkdir("/dev");
        FS.registerDevice(FS.makedev(1, 3), {
            read: (function() {
                return 0
            }),
            write: (function(stream, buffer, offset, length, pos) {
                return length
            })
        });
        FS.mkdev("/dev/null", FS.makedev(1, 3));
        TTY.register(FS.makedev(5, 0), TTY.default_tty_ops);
        TTY.register(FS.makedev(6, 0), TTY.default_tty1_ops);
        FS.mkdev("/dev/tty", FS.makedev(5, 0));
        FS.mkdev("/dev/tty1", FS.makedev(6, 0));
        var random_device;
        if (typeof crypto !== "undefined") {
            var randomBuffer = new Uint8Array(1);
            random_device = (function() {
                crypto.getRandomValues(randomBuffer);
                return randomBuffer[0]
            })
        } else if (ENVIRONMENT_IS_NODE) {
            random_device = (function() {
                return require("crypto")["randomBytes"](1)[0]
            })
        } else {
            random_device = (function() {
                return Math.random() * 256 | 0
            })
        }
        FS.createDevice("/dev", "random", random_device);
        FS.createDevice("/dev", "urandom", random_device);
        FS.mkdir("/dev/shm");
        FS.mkdir("/dev/shm/tmp")
    }),
    createSpecialDirectories: (function() {
        FS.mkdir("/proc");
        FS.mkdir("/proc/self");
        FS.mkdir("/proc/self/fd");
        FS.mount({
            mount: (function() {
                var node = FS.createNode("/proc/self", "fd", 16384 | 511, 73);
                node.node_ops = {
                    lookup: (function(parent, name) {
                        var fd = +name;
                        var stream = FS.getStream(fd);
                        if (!stream) throw new FS.ErrnoError(ERRNO_CODES.EBADF);
                        var ret = {
                            parent: null,
                            mount: {
                                mountpoint: "fake"
                            },
                            node_ops: {
                                readlink: (function() {
                                    return stream.path
                                })
                            }
                        };
                        ret.parent = ret;
                        return ret
                    })
                };
                return node
            })
        }, {}, "/proc/self/fd")
    }),
    createStandardStreams: (function() {
        if (Module["stdin"]) {
            FS.createDevice("/dev", "stdin", Module["stdin"])
        } else {
            FS.symlink("/dev/tty", "/dev/stdin")
        }
        if (Module["stdout"]) {
            FS.createDevice("/dev", "stdout", null, Module["stdout"])
        } else {
            FS.symlink("/dev/tty", "/dev/stdout")
        }
        if (Module["stderr"]) {
            FS.createDevice("/dev", "stderr", null, Module["stderr"])
        } else {
            FS.symlink("/dev/tty1", "/dev/stderr")
        }
        var stdin = FS.open("/dev/stdin", "r");
        assert(stdin.fd === 0, "invalid handle for stdin (" + stdin.fd + ")");
        var stdout = FS.open("/dev/stdout", "w");
        assert(stdout.fd === 1, "invalid handle for stdout (" + stdout.fd + ")");
        var stderr = FS.open("/dev/stderr", "w");
        assert(stderr.fd === 2, "invalid handle for stderr (" + stderr.fd + ")")
    }),
    ensureErrnoError: (function() {
        if (FS.ErrnoError) return;
        FS.ErrnoError = function ErrnoError(errno, node) {
            this.node = node;
            this.setErrno = (function(errno) {
                this.errno = errno;
                for (var key in ERRNO_CODES) {
                    if (ERRNO_CODES[key] === errno) {
                        this.code = key;
                        break
                    }
                }
            });
            this.setErrno(errno);
            this.message = ERRNO_MESSAGES[errno];
            if (this.stack) Object.defineProperty(this, "stack", {
                value: (new Error).stack,
                writable: true
            })
        };
        FS.ErrnoError.prototype = new Error;
        FS.ErrnoError.prototype.constructor = FS.ErrnoError;
        [ERRNO_CODES.ENOENT].forEach((function(code) {
            FS.genericErrors[code] = new FS.ErrnoError(code);
            FS.genericErrors[code].stack = "<generic error, no stack>"
        }))
    }),
    staticInit: (function() {
        FS.ensureErrnoError();
        FS.nameTable = new Array(4096);
        FS.mount(MEMFS, {}, "/");
        FS.createDefaultDirectories();
        FS.createDefaultDevices();
        FS.createSpecialDirectories();
        FS.filesystems = {
            "MEMFS": MEMFS,
            "IDBFS": IDBFS,
            "NODEFS": NODEFS,
            "WORKERFS": WORKERFS
        }
    }),
    init: (function(input, output, error) {
        assert(!FS.init.initialized, "FS.init was previously called. If you want to initialize later with custom parameters, remove any earlier calls (note that one is automatically added to the generated code)");
        FS.init.initialized = true;
        FS.ensureErrnoError();
        Module["stdin"] = input || Module["stdin"];
        Module["stdout"] = output || Module["stdout"];
        Module["stderr"] = error || Module["stderr"];
        FS.createStandardStreams()
    }),
    quit: (function() {
        FS.init.initialized = false;
        var fflush = Module["_fflush"];
        if (fflush) fflush(0);
        for (var i = 0; i < FS.streams.length; i++) {
            var stream = FS.streams[i];
            if (!stream) {
                continue
            }
            FS.close(stream)
        }
    }),
    getMode: (function(canRead, canWrite) {
        var mode = 0;
        if (canRead) mode |= 292 | 73;
        if (canWrite) mode |= 146;
        return mode
    }),
    joinPath: (function(parts, forceRelative) {
        var path = PATH.join.apply(null, parts);
        if (forceRelative && path[0] == "/") path = path.substr(1);
        return path
    }),
    absolutePath: (function(relative, base) {
        return PATH.resolve(base, relative)
    }),
    standardizePath: (function(path) {
        return PATH.normalize(path)
    }),
    findObject: (function(path, dontResolveLastLink) {
        var ret = FS.analyzePath(path, dontResolveLastLink);
        if (ret.exists) {
            return ret.object
        } else {
            ___setErrNo(ret.error);
            return null
        }
    }),
    analyzePath: (function(path, dontResolveLastLink) {
        try {
            var lookup = FS.lookupPath(path, {
                follow: !dontResolveLastLink
            });
            path = lookup.path
        } catch (e) {}
        var ret = {
            isRoot: false,
            exists: false,
            error: 0,
            name: null,
            path: null,
            object: null,
            parentExists: false,
            parentPath: null,
            parentObject: null
        };
        try {
            var lookup = FS.lookupPath(path, {
                parent: true
            });
            ret.parentExists = true;
            ret.parentPath = lookup.path;
            ret.parentObject = lookup.node;
            ret.name = PATH.basename(path);
            lookup = FS.lookupPath(path, {
                follow: !dontResolveLastLink
            });
            ret.exists = true;
            ret.path = lookup.path;
            ret.object = lookup.node;
            ret.name = lookup.node.name;
            ret.isRoot = lookup.path === "/"
        } catch (e) {
            ret.error = e.errno
        }
        return ret
    }),
    createFolder: (function(parent, name, canRead, canWrite) {
        var path = PATH.join2(typeof parent === "string" ? parent : FS.getPath(parent), name);
        var mode = FS.getMode(canRead, canWrite);
        return FS.mkdir(path, mode)
    }),
    createPath: (function(parent, path, canRead, canWrite) {
        parent = typeof parent === "string" ? parent : FS.getPath(parent);
        var parts = path.split("/").reverse();
        while (parts.length) {
            var part = parts.pop();
            if (!part) continue;
            var current = PATH.join2(parent, part);
            try {
                FS.mkdir(current)
            } catch (e) {}
            parent = current
        }
        return current
    }),
    createFile: (function(parent, name, properties, canRead, canWrite) {
        var path = PATH.join2(typeof parent === "string" ? parent : FS.getPath(parent), name);
        var mode = FS.getMode(canRead, canWrite);
        return FS.create(path, mode)
    }),
    createDataFile: (function(parent, name, data, canRead, canWrite, canOwn) {
        var path = name ? PATH.join2(typeof parent === "string" ? parent : FS.getPath(parent), name) : parent;
        var mode = FS.getMode(canRead, canWrite);
        var node = FS.create(path, mode);
        if (data) {
            if (typeof data === "string") {
                var arr = new Array(data.length);
                for (var i = 0, len = data.length; i < len; ++i) arr[i] = data.charCodeAt(i);
                data = arr
            }
            FS.chmod(node, mode | 146);
            var stream = FS.open(node, "w");
            FS.write(stream, data, 0, data.length, 0, canOwn);
            FS.close(stream);
            FS.chmod(node, mode)
        }
        return node
    }),
    createDevice: (function(parent, name, input, output) {
        var path = PATH.join2(typeof parent === "string" ? parent : FS.getPath(parent), name);
        var mode = FS.getMode(!!input, !!output);
        if (!FS.createDevice.major) FS.createDevice.major = 64;
        var dev = FS.makedev(FS.createDevice.major++, 0);
        FS.registerDevice(dev, {
            open: (function(stream) {
                stream.seekable = false
            }),
            close: (function(stream) {
                if (output && output.buffer && output.buffer.length) {
                    output(10)
                }
            }),
            read: (function(stream, buffer, offset, length, pos) {
                var bytesRead = 0;
                for (var i = 0; i < length; i++) {
                    var result;
                    try {
                        result = input()
                    } catch (e) {
                        throw new FS.ErrnoError(ERRNO_CODES.EIO)
                    }
                    if (result === undefined && bytesRead === 0) {
                        throw new FS.ErrnoError(ERRNO_CODES.EAGAIN)
                    }
                    if (result === null || result === undefined) break;
                    bytesRead++;
                    buffer[offset + i] = result
                }
                if (bytesRead) {
                    stream.node.timestamp = Date.now()
                }
                return bytesRead
            }),
            write: (function(stream, buffer, offset, length, pos) {
                for (var i = 0; i < length; i++) {
                    try {
                        output(buffer[offset + i])
                    } catch (e) {
                        throw new FS.ErrnoError(ERRNO_CODES.EIO)
                    }
                }
                if (length) {
                    stream.node.timestamp = Date.now()
                }
                return i
            })
        });
        return FS.mkdev(path, mode, dev)
    }),
    createLink: (function(parent, name, target, canRead, canWrite) {
        var path = PATH.join2(typeof parent === "string" ? parent : FS.getPath(parent), name);
        return FS.symlink(target, path)
    }),
    forceLoadFile: (function(obj) {
        if (obj.isDevice || obj.isFolder || obj.link || obj.contents) return true;
        var success = true;
        if (typeof XMLHttpRequest !== "undefined") {
            throw new Error("Lazy loading should have been performed (contents set) in createLazyFile, but it was not. Lazy loading only works in web workers. Use --embed-file or --preload-file in emcc on the main thread.")
        } else if (Module["read"]) {
            try {
                obj.contents = intArrayFromString(Module["read"](obj.url), true);
                obj.usedBytes = obj.contents.length
            } catch (e) {
                success = false
            }
        } else {
            throw new Error("Cannot load without read() or XMLHttpRequest.")
        }
        if (!success) ___setErrNo(ERRNO_CODES.EIO);
        return success
    }),
    createLazyFile: (function(parent, name, url, canRead, canWrite) {
        function LazyUint8Array() {
            this.lengthKnown = false;
            this.chunks = []
        }
        LazyUint8Array.prototype.get = function LazyUint8Array_get(idx) {
            if (idx > this.length - 1 || idx < 0) {
                return undefined
            }
            var chunkOffset = idx % this.chunkSize;
            var chunkNum = idx / this.chunkSize | 0;
            return this.getter(chunkNum)[chunkOffset]
        };
        LazyUint8Array.prototype.setDataGetter = function LazyUint8Array_setDataGetter(getter) {
            this.getter = getter
        };
        LazyUint8Array.prototype.cacheLength = function LazyUint8Array_cacheLength() {
            var xhr = new XMLHttpRequest;
            xhr.open("HEAD", url, false);
            xhr.send(null);
            if (!(xhr.status >= 200 && xhr.status < 300 || xhr.status === 304)) throw new Error("Couldn't load " + url + ". Status: " + xhr.status);
            var datalength = Number(xhr.getResponseHeader("Content-length"));
            var header;
            var hasByteServing = (header = xhr.getResponseHeader("Accept-Ranges")) && header === "bytes";
            var usesGzip = (header = xhr.getResponseHeader("Content-Encoding")) && header === "gzip";
            var chunkSize = 1024 * 1024;
            if (!hasByteServing) chunkSize = datalength;
            var doXHR = (function(from, to) {
                if (from > to) throw new Error("invalid range (" + from + ", " + to + ") or no bytes requested!");
                if (to > datalength - 1) throw new Error("only " + datalength + " bytes available! programmer error!");
                var xhr = new XMLHttpRequest;
                xhr.open("GET", url, false);
                if (datalength !== chunkSize) xhr.setRequestHeader("Range", "bytes=" + from + "-" + to);
                if (typeof Uint8Array != "undefined") xhr.responseType = "arraybuffer";
                if (xhr.overrideMimeType) {
                    xhr.overrideMimeType("text/plain; charset=x-user-defined")
                }
                xhr.send(null);
                if (!(xhr.status >= 200 && xhr.status < 300 || xhr.status === 304)) throw new Error("Couldn't load " + url + ". Status: " + xhr.status);
                if (xhr.response !== undefined) {
                    return new Uint8Array(xhr.response || [])
                } else {
                    return intArrayFromString(xhr.responseText || "", true)
                }
            });
            var lazyArray = this;
            lazyArray.setDataGetter((function(chunkNum) {
                var start = chunkNum * chunkSize;
                var end = (chunkNum + 1) * chunkSize - 1;
                end = Math.min(end, datalength - 1);
                if (typeof lazyArray.chunks[chunkNum] === "undefined") {
                    lazyArray.chunks[chunkNum] = doXHR(start, end)
                }
                if (typeof lazyArray.chunks[chunkNum] === "undefined") throw new Error("doXHR failed!");
                return lazyArray.chunks[chunkNum]
            }));
            if (usesGzip || !datalength) {
                chunkSize = datalength = 1;
                datalength = this.getter(0).length;
                chunkSize = datalength;
                console.log("LazyFiles on gzip forces download of the whole file when length is accessed")
            }
            this._length = datalength;
            this._chunkSize = chunkSize;
            this.lengthKnown = true
        };
        if (typeof XMLHttpRequest !== "undefined") {
            if (!ENVIRONMENT_IS_WORKER) throw "Cannot do synchronous binary XHRs outside webworkers in modern browsers. Use --embed-file or --preload-file in emcc";
            var lazyArray = new LazyUint8Array;
            Object.defineProperties(lazyArray, {
                length: {
                    get: (function() {
                        if (!this.lengthKnown) {
                            this.cacheLength()
                        }
                        return this._length
                    })
                },
                chunkSize: {
                    get: (function() {
                        if (!this.lengthKnown) {
                            this.cacheLength()
                        }
                        return this._chunkSize
                    })
                }
            });
            var properties = {
                isDevice: false,
                contents: lazyArray
            }
        } else {
            var properties = {
                isDevice: false,
                url: url
            }
        }
        var node = FS.createFile(parent, name, properties, canRead, canWrite);
        if (properties.contents) {
            node.contents = properties.contents
        } else if (properties.url) {
            node.contents = null;
            node.url = properties.url
        }
        Object.defineProperties(node, {
            usedBytes: {
                get: (function() {
                    return this.contents.length
                })
            }
        });
        var stream_ops = {};
        var keys = Object.keys(node.stream_ops);
        keys.forEach((function(key) {
            var fn = node.stream_ops[key];
            stream_ops[key] = function forceLoadLazyFile() {
                if (!FS.forceLoadFile(node)) {
                    throw new FS.ErrnoError(ERRNO_CODES.EIO)
                }
                return fn.apply(null, arguments)
            }
        }));
        stream_ops.read = function stream_ops_read(stream, buffer, offset, length, position) {
            if (!FS.forceLoadFile(node)) {
                throw new FS.ErrnoError(ERRNO_CODES.EIO)
            }
            var contents = stream.node.contents;
            if (position >= contents.length) return 0;
            var size = Math.min(contents.length - position, length);
            assert(size >= 0);
            if (contents.slice) {
                for (var i = 0; i < size; i++) {
                    buffer[offset + i] = contents[position + i]
                }
            } else {
                for (var i = 0; i < size; i++) {
                    buffer[offset + i] = contents.get(position + i)
                }
            }
            return size
        };
        node.stream_ops = stream_ops;
        return node
    }),
    createPreloadedFile: (function(parent, name, url, canRead, canWrite, onload, onerror, dontCreateFile, canOwn, preFinish) {
        Browser.init();
        var fullname = name ? PATH.resolve(PATH.join2(parent, name)) : parent;
        var dep = getUniqueRunDependency("cp " + fullname);

        function processData(byteArray) {
            function finish(byteArray) {
                if (preFinish) preFinish();
                if (!dontCreateFile) {
                    FS.createDataFile(parent, name, byteArray, canRead, canWrite, canOwn)
                }
                if (onload) onload();
                removeRunDependency(dep)
            }
            var handled = false;
            Module["preloadPlugins"].forEach((function(plugin) {
                if (handled) return;
                if (plugin["canHandle"](fullname)) {
                    plugin["handle"](byteArray, fullname, finish, (function() {
                        if (onerror) onerror();
                        removeRunDependency(dep)
                    }));
                    handled = true
                }
            }));
            if (!handled) finish(byteArray)
        }
        addRunDependency(dep);
        if (typeof url == "string") {
            Browser.asyncLoad(url, (function(byteArray) {
                processData(byteArray)
            }), onerror)
        } else {
            processData(url)
        }
    }),
    indexedDB: (function() {
        return window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB
    }),
    DB_NAME: (function() {
        return "EM_FS_" + window.location.pathname
    }),
    DB_VERSION: 20,
    DB_STORE_NAME: "FILE_DATA",
    saveFilesToDB: (function(paths, onload, onerror) {
        onload = onload || (function() {});
        onerror = onerror || (function() {});
        var indexedDB = FS.indexedDB();
        try {
            var openRequest = indexedDB.open(FS.DB_NAME(), FS.DB_VERSION)
        } catch (e) {
            return onerror(e)
        }
        openRequest.onupgradeneeded = function openRequest_onupgradeneeded() {
            console.log("creating db");
            var db = openRequest.result;
            db.createObjectStore(FS.DB_STORE_NAME)
        };
        openRequest.onsuccess = function openRequest_onsuccess() {
            var db = openRequest.result;
            var transaction = db.transaction([FS.DB_STORE_NAME], "readwrite");
            var files = transaction.objectStore(FS.DB_STORE_NAME);
            var ok = 0,
                fail = 0,
                total = paths.length;

            function finish() {
                if (fail == 0) onload();
                else onerror()
            }
            paths.forEach((function(path) {
                var putRequest = files.put(FS.analyzePath(path).object.contents, path);
                putRequest.onsuccess = function putRequest_onsuccess() {
                    ok++;
                    if (ok + fail == total) finish()
                };
                putRequest.onerror = function putRequest_onerror() {
                    fail++;
                    if (ok + fail == total) finish()
                }
            }));
            transaction.onerror = onerror
        };
        openRequest.onerror = onerror
    }),
    loadFilesFromDB: (function(paths, onload, onerror) {
        onload = onload || (function() {});
        onerror = onerror || (function() {});
        var indexedDB = FS.indexedDB();
        try {
            var openRequest = indexedDB.open(FS.DB_NAME(), FS.DB_VERSION)
        } catch (e) {
            return onerror(e)
        }
        openRequest.onupgradeneeded = onerror;
        openRequest.onsuccess = function openRequest_onsuccess() {
            var db = openRequest.result;
            try {
                var transaction = db.transaction([FS.DB_STORE_NAME], "readonly")
            } catch (e) {
                onerror(e);
                return
            }
            var files = transaction.objectStore(FS.DB_STORE_NAME);
            var ok = 0,
                fail = 0,
                total = paths.length;

            function finish() {
                if (fail == 0) onload();
                else onerror()
            }
            paths.forEach((function(path) {
                var getRequest = files.get(path);
                getRequest.onsuccess = function getRequest_onsuccess() {
                    if (FS.analyzePath(path).exists) {
                        FS.unlink(path)
                    }
                    FS.createDataFile(PATH.dirname(path), PATH.basename(path), getRequest.result, true, true, true);
                    ok++;
                    if (ok + fail == total) finish()
                };
                getRequest.onerror = function getRequest_onerror() {
                    fail++;
                    if (ok + fail == total) finish()
                }
            }));
            transaction.onerror = onerror
        };
        openRequest.onerror = onerror
    })
};
var SYSCALLS = {
    DEFAULT_POLLMASK: 5,
    mappings: {},
    umask: 511,
    calculateAt: (function(dirfd, path) {
        if (path[0] !== "/") {
            var dir;
            if (dirfd === -100) {
                dir = FS.cwd()
            } else {
                var dirstream = FS.getStream(dirfd);
                if (!dirstream) throw new FS.ErrnoError(ERRNO_CODES.EBADF);
                dir = dirstream.path
            }
            path = PATH.join2(dir, path)
        }
        return path
    }),
    doStat: (function(func, path, buf) {
        try {
            var stat = func(path)
        } catch (e) {
            if (e && e.node && PATH.normalize(path) !== PATH.normalize(FS.getPath(e.node))) {
                return -ERRNO_CODES.ENOTDIR
            }
            throw e
        }
        HEAP32[buf >> 2] = stat.dev;
        HEAP32[buf + 4 >> 2] = 0;
        HEAP32[buf + 8 >> 2] = stat.ino;
        HEAP32[buf + 12 >> 2] = stat.mode;
        HEAP32[buf + 16 >> 2] = stat.nlink;
        HEAP32[buf + 20 >> 2] = stat.uid;
        HEAP32[buf + 24 >> 2] = stat.gid;
        HEAP32[buf + 28 >> 2] = stat.rdev;
        HEAP32[buf + 32 >> 2] = 0;
        HEAP32[buf + 36 >> 2] = stat.size;
        HEAP32[buf + 40 >> 2] = 4096;
        HEAP32[buf + 44 >> 2] = stat.blocks;
        HEAP32[buf + 48 >> 2] = stat.atime.getTime() / 1e3 | 0;
        HEAP32[buf + 52 >> 2] = 0;
        HEAP32[buf + 56 >> 2] = stat.mtime.getTime() / 1e3 | 0;
        HEAP32[buf + 60 >> 2] = 0;
        HEAP32[buf + 64 >> 2] = stat.ctime.getTime() / 1e3 | 0;
        HEAP32[buf + 68 >> 2] = 0;
        HEAP32[buf + 72 >> 2] = stat.ino;
        return 0
    }),
    doMsync: (function(addr, stream, len, flags) {
        var buffer = new Uint8Array(HEAPU8.subarray(addr, addr + len));
        FS.msync(stream, buffer, 0, len, flags)
    }),
    doMkdir: (function(path, mode) {
        path = PATH.normalize(path);
        if (path[path.length - 1] === "/") path = path.substr(0, path.length - 1);
        FS.mkdir(path, mode, 0);
        return 0
    }),
    doMknod: (function(path, mode, dev) {
        switch (mode & 61440) {
            case 32768:
            case 8192:
            case 24576:
            case 4096:
            case 49152:
                break;
            default:
                return -ERRNO_CODES.EINVAL
        }
        FS.mknod(path, mode, dev);
        return 0
    }),
    doReadlink: (function(path, buf, bufsize) {
        if (bufsize <= 0) return -ERRNO_CODES.EINVAL;
        var ret = FS.readlink(path);
        var len = Math.min(bufsize, lengthBytesUTF8(ret));
        var endChar = HEAP8[buf + len];
        stringToUTF8(ret, buf, bufsize + 1);
        HEAP8[buf + len] = endChar;
        return len
    }),
    doAccess: (function(path, amode) {
        if (amode & ~7) {
            return -ERRNO_CODES.EINVAL
        }
        var node;
        var lookup = FS.lookupPath(path, {
            follow: true
        });
        node = lookup.node;
        var perms = "";
        if (amode & 4) perms += "r";
        if (amode & 2) perms += "w";
        if (amode & 1) perms += "x";
        if (perms && FS.nodePermissions(node, perms)) {
            return -ERRNO_CODES.EACCES
        }
        return 0
    }),
    doDup: (function(path, flags, suggestFD) {
        var suggest = FS.getStream(suggestFD);
        if (suggest) FS.close(suggest);
        return FS.open(path, flags, 0, suggestFD, suggestFD).fd
    }),
    doReadv: (function(stream, iov, iovcnt, offset) {
        var ret = 0;
        for (var i = 0; i < iovcnt; i++) {
            var ptr = HEAP32[iov + i * 8 >> 2];
            var len = HEAP32[iov + (i * 8 + 4) >> 2];
            var curr = FS.read(stream, HEAP8, ptr, len, offset);
            if (curr < 0) return -1;
            ret += curr;
            if (curr < len) break
        }
        return ret
    }),
    doWritev: (function(stream, iov, iovcnt, offset) {
        var ret = 0;
        for (var i = 0; i < iovcnt; i++) {
            var ptr = HEAP32[iov + i * 8 >> 2];
            var len = HEAP32[iov + (i * 8 + 4) >> 2];
            var curr = FS.write(stream, HEAP8, ptr, len, offset);
            if (curr < 0) return -1;
            ret += curr
        }
        return ret
    }),
    varargs: 0,
    get: (function(varargs) {
        SYSCALLS.varargs += 4;
        var ret = HEAP32[SYSCALLS.varargs - 4 >> 2];
        return ret
    }),
    getStr: (function() {
        var ret = Pointer_stringify(SYSCALLS.get());
        return ret
    }),
    getStreamFromFD: (function() {
        var stream = FS.getStream(SYSCALLS.get());
        if (!stream) throw new FS.ErrnoError(ERRNO_CODES.EBADF);
        return stream
    }),
    getSocketFromFD: (function() {
        var socket = SOCKFS.getSocket(SYSCALLS.get());
        if (!socket) throw new FS.ErrnoError(ERRNO_CODES.EBADF);
        return socket
    }),
    getSocketAddress: (function(allowNull) {
        var addrp = SYSCALLS.get(),
            addrlen = SYSCALLS.get();
        if (allowNull && addrp === 0) return null;
        var info = __read_sockaddr(addrp, addrlen);
        if (info.errno) throw new FS.ErrnoError(info.errno);
        info.addr = DNS.lookup_addr(info.addr) || info.addr;
        return info
    }),
    get64: (function() {
        var low = SYSCALLS.get(),
            high = SYSCALLS.get();
        if (low >= 0) assert(high === 0);
        else assert(high === -1);
        return low
    }),
    getZero: (function() {
        assert(SYSCALLS.get() === 0)
    })
};

function ___syscall10(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var path = SYSCALLS.getStr();
        FS.unlink(path);
        return 0
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
        return -e.errno
    }
}

function ___syscall140(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var stream = SYSCALLS.getStreamFromFD(),
            offset_high = SYSCALLS.get(),
            offset_low = SYSCALLS.get(),
            result = SYSCALLS.get(),
            whence = SYSCALLS.get();
        var offset = offset_low;
        FS.llseek(stream, offset, whence);
        HEAP32[result >> 2] = stream.position;
        if (stream.getdents && offset === 0 && whence === 0) stream.getdents = null;
        return 0
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
        return -e.errno
    }
}

function ___syscall145(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var stream = SYSCALLS.getStreamFromFD(),
            iov = SYSCALLS.get(),
            iovcnt = SYSCALLS.get();
        return SYSCALLS.doReadv(stream, iov, iovcnt)
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
        return -e.errno
    }
}

function ___syscall146(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var stream = SYSCALLS.getStreamFromFD(),
            iov = SYSCALLS.get(),
            iovcnt = SYSCALLS.get();
        return SYSCALLS.doWritev(stream, iov, iovcnt)
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
        return -e.errno
    }
}

function ___syscall195(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var path = SYSCALLS.getStr(),
            buf = SYSCALLS.get();
        return SYSCALLS.doStat(FS.stat, path, buf)
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
        return -e.errno
    }
}

function ___syscall197(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var stream = SYSCALLS.getStreamFromFD(),
            buf = SYSCALLS.get();
        return SYSCALLS.doStat(FS.stat, stream.path, buf)
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
        return -e.errno
    }
}
var PROCINFO = {
    ppid: 1,
    pid: 42,
    sid: 42,
    pgid: 42
};

function ___syscall20(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        return PROCINFO.pid
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
        return -e.errno
    }
}

function ___syscall220(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var stream = SYSCALLS.getStreamFromFD(),
            dirp = SYSCALLS.get(),
            count = SYSCALLS.get();
        if (!stream.getdents) {
            stream.getdents = FS.readdir(stream.path)
        }
        var pos = 0;
        while (stream.getdents.length > 0 && pos + 268 <= count) {
            var id;
            var type;
            var name = stream.getdents.pop();
            if (name[0] === ".") {
                id = 1;
                type = 4
            } else {
                var child = FS.lookupNode(stream.node, name);
                id = child.id;
                type = FS.isChrdev(child.mode) ? 2 : FS.isDir(child.mode) ? 4 : FS.isLink(child.mode) ? 10 : 8
            }
            HEAP32[dirp + pos >> 2] = id;
            HEAP32[dirp + pos + 4 >> 2] = stream.position;
            HEAP16[dirp + pos + 8 >> 1] = 268;
            HEAP8[dirp + pos + 10 >> 0] = type;
            stringToUTF8(name, dirp + pos + 11, 256);
            pos += 268
        }
        return pos
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
        return -e.errno
    }
}

function ___syscall221(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var stream = SYSCALLS.getStreamFromFD(),
            cmd = SYSCALLS.get();
        switch (cmd) {
            case 0:
                {
                    var arg = SYSCALLS.get();
                    if (arg < 0) {
                        return -ERRNO_CODES.EINVAL
                    }
                    var newStream;newStream = FS.open(stream.path, stream.flags, 0, arg);
                    return newStream.fd
                };
            case 1:
            case 2:
                return 0;
            case 3:
                return stream.flags;
            case 4:
                {
                    var arg = SYSCALLS.get();stream.flags |= arg;
                    return 0
                };
            case 12:
            case 12:
                {
                    var arg = SYSCALLS.get();
                    var offset = 0;HEAP16[arg + offset >> 1] = 2;
                    return 0
                };
            case 13:
            case 14:
            case 13:
            case 14:
                return 0;
            case 16:
            case 8:
                return -ERRNO_CODES.EINVAL;
            case 9:
                ___setErrNo(ERRNO_CODES.EINVAL);
                return -1;
            default:
                {
                    return -ERRNO_CODES.EINVAL
                }
        }
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
        return -e.errno
    }
}

function ___syscall3(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var stream = SYSCALLS.getStreamFromFD(),
            buf = SYSCALLS.get(),
            count = SYSCALLS.get();
        return FS.read(stream, HEAP8, buf, count)
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
        return -e.errno
    }
}

function ___syscall39(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var path = SYSCALLS.getStr(),
            mode = SYSCALLS.get();
        return SYSCALLS.doMkdir(path, mode)
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
        return -e.errno
    }
}

function ___syscall4(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var stream = SYSCALLS.getStreamFromFD(),
            buf = SYSCALLS.get(),
            count = SYSCALLS.get();
        return FS.write(stream, HEAP8, buf, count)
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
        return -e.errno
    }
}

function ___syscall40(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var path = SYSCALLS.getStr();
        FS.rmdir(path);
        return 0
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
        return -e.errno
    }
}

function ___syscall5(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var pathname = SYSCALLS.getStr(),
            flags = SYSCALLS.get(),
            mode = SYSCALLS.get();
        var stream = FS.open(pathname, flags, mode);
        return stream.fd
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
        return -e.errno
    }
}

function ___syscall54(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var stream = SYSCALLS.getStreamFromFD(),
            op = SYSCALLS.get();
        switch (op) {
            case 21509:
            case 21505:
                {
                    if (!stream.tty) return -ERRNO_CODES.ENOTTY;
                    return 0
                };
            case 21510:
            case 21511:
            case 21512:
            case 21506:
            case 21507:
            case 21508:
                {
                    if (!stream.tty) return -ERRNO_CODES.ENOTTY;
                    return 0
                };
            case 21519:
                {
                    if (!stream.tty) return -ERRNO_CODES.ENOTTY;
                    var argp = SYSCALLS.get();HEAP32[argp >> 2] = 0;
                    return 0
                };
            case 21520:
                {
                    if (!stream.tty) return -ERRNO_CODES.ENOTTY;
                    return -ERRNO_CODES.EINVAL
                };
            case 21531:
                {
                    var argp = SYSCALLS.get();
                    return FS.ioctl(stream, op, argp)
                };
            case 21523:
                {
                    if (!stream.tty) return -ERRNO_CODES.ENOTTY;
                    return 0
                };
            default:
                abort("bad ioctl syscall " + op)
        }
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
        return -e.errno
    }
}

function ___syscall6(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var stream = SYSCALLS.getStreamFromFD();
        FS.close(stream);
        return 0
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
        return -e.errno
    }
}

function ___syscall85(which, varargs) {
    SYSCALLS.varargs = varargs;
    try {
        var path = SYSCALLS.getStr(),
            buf = SYSCALLS.get(),
            bufsize = SYSCALLS.get();
        return SYSCALLS.doReadlink(path, buf, bufsize)
    } catch (e) {
        if (typeof FS === "undefined" || !(e instanceof FS.ErrnoError)) abort(e);
        return -e.errno
    }
}

function ___unlock() {}

function _abort() {
    Module["abort"]()
}

function _emscripten_get_now_is_monotonic() {
    return ENVIRONMENT_IS_NODE || typeof dateNow !== "undefined" || (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) && self["performance"] && self["performance"]["now"]
}

function _clock_gettime(clk_id, tp) {
    var now;
    if (clk_id === 0) {
        now = Date.now()
    } else if (clk_id === 1 && _emscripten_get_now_is_monotonic()) {
        now = _emscripten_get_now()
    } else {
        ___setErrNo(ERRNO_CODES.EINVAL);
        return -1
    }
    HEAP32[tp >> 2] = now / 1e3 | 0;
    HEAP32[tp + 4 >> 2] = now % 1e3 * 1e3 * 1e3 | 0;
    return 0
}
var EGL = {
    errorCode: 12288,
    defaultDisplayInitialized: false,
    currentContext: 0,
    currentReadSurface: 0,
    currentDrawSurface: 0,
    stringCache: {},
    setErrorCode: (function(code) {
        EGL.errorCode = code
    }),
    chooseConfig: (function(display, attribList, config, config_size, numConfigs) {
        if (display != 62e3) {
            EGL.setErrorCode(12296);
            return 0
        }
        if ((!config || !config_size) && !numConfigs) {
            EGL.setErrorCode(12300);
            return 0
        }
        if (numConfigs) {
            HEAP32[numConfigs >> 2] = 1
        }
        if (config && config_size > 0) {
            HEAP32[config >> 2] = 62002
        }
        EGL.setErrorCode(12288);
        return 1
    })
};

function _eglWaitClient() {
    EGL.setErrorCode(12288);
    return 1
}

function _eglBindAPI(api) {
    if (api == 12448) {
        EGL.setErrorCode(12288);
        return 1
    } else {
        EGL.setErrorCode(12300);
        return 0
    }
}

function _eglChooseConfig(display, attrib_list, configs, config_size, numConfigs) {
    return EGL.chooseConfig(display, attrib_list, configs, config_size, numConfigs)
}
var GLUT = {
    initTime: null,
    idleFunc: null,
    displayFunc: null,
    keyboardFunc: null,
    keyboardUpFunc: null,
    specialFunc: null,
    specialUpFunc: null,
    reshapeFunc: null,
    motionFunc: null,
    passiveMotionFunc: null,
    mouseFunc: null,
    buttons: 0,
    modifiers: 0,
    initWindowWidth: 256,
    initWindowHeight: 256,
    initDisplayMode: 18,
    windowX: 0,
    windowY: 0,
    windowWidth: 0,
    windowHeight: 0,
    requestedAnimationFrame: false,
    saveModifiers: (function(event) {
        GLUT.modifiers = 0;
        if (event["shiftKey"]) GLUT.modifiers += 1;
        if (event["ctrlKey"]) GLUT.modifiers += 2;
        if (event["altKey"]) GLUT.modifiers += 4
    }),
    onMousemove: (function(event) {
        var lastX = Browser.mouseX;
        var lastY = Browser.mouseY;
        Browser.calculateMouseEvent(event);
        var newX = Browser.mouseX;
        var newY = Browser.mouseY;
        if (newX == lastX && newY == lastY) return;
        if (GLUT.buttons == 0 && event.target == Module["canvas"] && GLUT.passiveMotionFunc) {
            event.preventDefault();
            GLUT.saveModifiers(event);
            Module["dynCall_vii"](GLUT.passiveMotionFunc, lastX, lastY)
        } else if (GLUT.buttons != 0 && GLUT.motionFunc) {
            event.preventDefault();
            GLUT.saveModifiers(event);
            Module["dynCall_vii"](GLUT.motionFunc, lastX, lastY)
        }
    }),
    getSpecialKey: (function(keycode) {
        var key = null;
        switch (keycode) {
            case 8:
                key = 120;
                break;
            case 46:
                key = 111;
                break;
            case 112:
                key = 1;
                break;
            case 113:
                key = 2;
                break;
            case 114:
                key = 3;
                break;
            case 115:
                key = 4;
                break;
            case 116:
                key = 5;
                break;
            case 117:
                key = 6;
                break;
            case 118:
                key = 7;
                break;
            case 119:
                key = 8;
                break;
            case 120:
                key = 9;
                break;
            case 121:
                key = 10;
                break;
            case 122:
                key = 11;
                break;
            case 123:
                key = 12;
                break;
            case 37:
                key = 100;
                break;
            case 38:
                key = 101;
                break;
            case 39:
                key = 102;
                break;
            case 40:
                key = 103;
                break;
            case 33:
                key = 104;
                break;
            case 34:
                key = 105;
                break;
            case 36:
                key = 106;
                break;
            case 35:
                key = 107;
                break;
            case 45:
                key = 108;
                break;
            case 16:
            case 5:
                key = 112;
                break;
            case 6:
                key = 113;
                break;
            case 17:
            case 3:
                key = 114;
                break;
            case 4:
                key = 115;
                break;
            case 18:
            case 2:
                key = 116;
                break;
            case 1:
                key = 117;
                break
        }
        return key
    }),
    getASCIIKey: (function(event) {
        if (event["ctrlKey"] || event["altKey"] || event["metaKey"]) return null;
        var keycode = event["keyCode"];
        if (48 <= keycode && keycode <= 57) return keycode;
        if (65 <= keycode && keycode <= 90) return event["shiftKey"] ? keycode : keycode + 32;
        if (96 <= keycode && keycode <= 105) return keycode - 48;
        if (106 <= keycode && keycode <= 111) return keycode - 106 + 42;
        switch (keycode) {
            case 9:
            case 13:
            case 27:
            case 32:
            case 61:
                return keycode
        }
        var s = event["shiftKey"];
        switch (keycode) {
            case 186:
                return s ? 58 : 59;
            case 187:
                return s ? 43 : 61;
            case 188:
                return s ? 60 : 44;
            case 189:
                return s ? 95 : 45;
            case 190:
                return s ? 62 : 46;
            case 191:
                return s ? 63 : 47;
            case 219:
                return s ? 123 : 91;
            case 220:
                return s ? 124 : 47;
            case 221:
                return s ? 125 : 93;
            case 222:
                return s ? 34 : 39
        }
        return null
    }),
    onKeydown: (function(event) {
        if (GLUT.specialFunc || GLUT.keyboardFunc) {
            var key = GLUT.getSpecialKey(event["keyCode"]);
            if (key !== null) {
                if (GLUT.specialFunc) {
                    event.preventDefault();
                    GLUT.saveModifiers(event);
                    Module["dynCall_viii"](GLUT.specialFunc, key, Browser.mouseX, Browser.mouseY)
                }
            } else {
                key = GLUT.getASCIIKey(event);
                if (key !== null && GLUT.keyboardFunc) {
                    event.preventDefault();
                    GLUT.saveModifiers(event);
                    Module["dynCall_viii"](GLUT.keyboardFunc, key, Browser.mouseX, Browser.mouseY)
                }
            }
        }
    }),
    onKeyup: (function(event) {
        if (GLUT.specialUpFunc || GLUT.keyboardUpFunc) {
            var key = GLUT.getSpecialKey(event["keyCode"]);
            if (key !== null) {
                if (GLUT.specialUpFunc) {
                    event.preventDefault();
                    GLUT.saveModifiers(event);
                    Module["dynCall_viii"](GLUT.specialUpFunc, key, Browser.mouseX, Browser.mouseY)
                }
            } else {
                key = GLUT.getASCIIKey(event);
                if (key !== null && GLUT.keyboardUpFunc) {
                    event.preventDefault();
                    GLUT.saveModifiers(event);
                    Module["dynCall_viii"](GLUT.keyboardUpFunc, key, Browser.mouseX, Browser.mouseY)
                }
            }
        }
    }),
    touchHandler: (function(event) {
        if (event.target != Module["canvas"]) {
            return
        }
        var touches = event.changedTouches,
            main = touches[0],
            type = "";
        switch (event.type) {
            case "touchstart":
                type = "mousedown";
                break;
            case "touchmove":
                type = "mousemove";
                break;
            case "touchend":
                type = "mouseup";
                break;
            default:
                return
        }
        var simulatedEvent = document.createEvent("MouseEvent");
        simulatedEvent.initMouseEvent(type, true, true, window, 1, main.screenX, main.screenY, main.clientX, main.clientY, false, false, false, false, 0, null);
        main.target.dispatchEvent(simulatedEvent);
        event.preventDefault()
    }),
    onMouseButtonDown: (function(event) {
        Browser.calculateMouseEvent(event);
        GLUT.buttons |= 1 << event["button"];
        if (event.target == Module["canvas"] && GLUT.mouseFunc) {
            try {
                event.target.setCapture()
            } catch (e) {}
            event.preventDefault();
            GLUT.saveModifiers(event);
            Module["dynCall_viiii"](GLUT.mouseFunc, event["button"], 0, Browser.mouseX, Browser.mouseY)
        }
    }),
    onMouseButtonUp: (function(event) {
        Browser.calculateMouseEvent(event);
        GLUT.buttons &= ~(1 << event["button"]);
        if (GLUT.mouseFunc) {
            event.preventDefault();
            GLUT.saveModifiers(event);
            Module["dynCall_viiii"](GLUT.mouseFunc, event["button"], 1, Browser.mouseX, Browser.mouseY)
        }
    }),
    onMouseWheel: (function(event) {
        Browser.calculateMouseEvent(event);
        var e = window.event || event;
        var delta = -Browser.getMouseWheelDelta(event);
        delta = delta == 0 ? 0 : delta > 0 ? Math.max(delta, 1) : Math.min(delta, -1);
        var button = 3;
        if (delta < 0) {
            button = 4
        }
        if (GLUT.mouseFunc) {
            event.preventDefault();
            GLUT.saveModifiers(event);
            Module["dynCall_viiii"](GLUT.mouseFunc, button, 0, Browser.mouseX, Browser.mouseY)
        }
    }),
    onFullscreenEventChange: (function(event) {
        var width;
        var height;
        if (document["fullscreen"] || document["fullScreen"] || document["mozFullScreen"] || document["webkitIsFullScreen"]) {
            width = screen["width"];
            height = screen["height"]
        } else {
            width = GLUT.windowWidth;
            height = GLUT.windowHeight;
            document.removeEventListener("fullscreenchange", GLUT.onFullscreenEventChange, true);
            document.removeEventListener("mozfullscreenchange", GLUT.onFullscreenEventChange, true);
            document.removeEventListener("webkitfullscreenchange", GLUT.onFullscreenEventChange, true)
        }
        Browser.setCanvasSize(width, height);
        if (GLUT.reshapeFunc) {
            Module["dynCall_vii"](GLUT.reshapeFunc, width, height)
        }
        _glutPostRedisplay()
    }),
    requestFullscreen: (function() {
        Browser.requestFullscreen(false, false)
    }),
    requestFullScreen: (function() {
        Module.printErr("GLUT.requestFullScreen() is deprecated. Please call GLUT.requestFullscreen instead.");
        GLUT.requestFullScreen = (function() {
            return GLUT.requestFullscreen()
        });
        return GLUT.requestFullscreen()
    }),
    exitFullscreen: (function() {
        var CFS = document["exitFullscreen"] || document["cancelFullScreen"] || document["mozCancelFullScreen"] || document["webkitCancelFullScreen"] || (function() {});
        CFS.apply(document, [])
    }),
    cancelFullScreen: (function() {
        Module.printErr("GLUT.cancelFullScreen() is deprecated. Please call GLUT.exitFullscreen instead.");
        GLUT.cancelFullScreen = (function() {
            return GLUT.exitFullscreen()
        });
        return GLUT.exitFullscreen()
    })
};

function _glutInitDisplayMode(mode) {
    GLUT.initDisplayMode = mode
}

function _glutCreateWindow(name) {
    var contextAttributes = {
        antialias: (GLUT.initDisplayMode & 128) != 0,
        depth: (GLUT.initDisplayMode & 16) != 0,
        stencil: (GLUT.initDisplayMode & 32) != 0,
        alpha: (GLUT.initDisplayMode & 8) != 0
    };
    Module.ctx = Browser.createContext(Module["canvas"], true, true, contextAttributes);
    return Module.ctx ? 1 : 0
}

function _eglCreateContext(display, config, hmm, contextAttribs) {
    if (display != 62e3) {
        EGL.setErrorCode(12296);
        return 0
    }
    var glesContextVersion = 1;
    for (;;) {
        var param = HEAP32[contextAttribs >> 2];
        if (param == 12440) {
            glesContextVersion = HEAP32[contextAttribs + 4 >> 2]
        } else if (param == 12344) {
            break
        } else {
            EGL.setErrorCode(12292);
            return 0
        }
        contextAttribs += 8
    }
    if (glesContextVersion != 2) {
        EGL.setErrorCode(12293);
        return 0
    }
    _glutInitDisplayMode(178);
    EGL.windowID = _glutCreateWindow();
    if (EGL.windowID != 0) {
        EGL.setErrorCode(12288);
        return 62004
    } else {
        EGL.setErrorCode(12297);
        return 0
    }
}

function _eglCreateWindowSurface(display, config, win, attrib_list) {
    if (display != 62e3) {
        EGL.setErrorCode(12296);
        return 0
    }
    if (config != 62002) {
        EGL.setErrorCode(12293);
        return 0
    }
    EGL.setErrorCode(12288);
    return 62006
}

function _glutDestroyWindow(name) {
    Module.ctx = Browser.destroyContext(Module["canvas"], true, true);
    return 1
}

function _eglDestroyContext(display, context) {
    if (display != 62e3) {
        EGL.setErrorCode(12296);
        return 0
    }
    if (context != 62004) {
        EGL.setErrorCode(12294);
        return 0
    }
    EGL.setErrorCode(12288);
    return 1
}

function _eglDestroySurface(display, surface) {
    if (display != 62e3) {
        EGL.setErrorCode(12296);
        return 0
    }
    if (surface != 62006) {
        EGL.setErrorCode(12301);
        return 1
    }
    if (EGL.currentReadSurface == surface) {
        EGL.currentReadSurface = 0
    }
    if (EGL.currentDrawSurface == surface) {
        EGL.currentDrawSurface = 0
    }
    EGL.setErrorCode(12288);
    return 1
}

function _eglGetCurrentContext() {
    return EGL.currentContext
}

function _eglGetDisplay(nativeDisplayType) {
    EGL.setErrorCode(12288);
    return 62e3
}

function _eglGetError() {
    return EGL.errorCode
}

function _eglGetProcAddress(name_) {
    return _emscripten_GetProcAddress(name_)
}

function _eglInitialize(display, majorVersion, minorVersion) {
    if (display == 62e3) {
        if (majorVersion) {
            HEAP32[majorVersion >> 2] = 1
        }
        if (minorVersion) {
            HEAP32[minorVersion >> 2] = 4
        }
        EGL.defaultDisplayInitialized = true;
        EGL.setErrorCode(12288);
        return 1
    } else {
        EGL.setErrorCode(12296);
        return 0
    }
}

function _eglMakeCurrent(display, draw, read, context) {
    if (display != 62e3) {
        EGL.setErrorCode(12296);
        return 0
    }
    if (context != 0 && context != 62004) {
        EGL.setErrorCode(12294);
        return 0
    }
    if (read != 0 && read != 62006 || draw != 0 && draw != 62006) {
        EGL.setErrorCode(12301);
        return 0
    }
    EGL.currentContext = context;
    EGL.currentDrawSurface = draw;
    EGL.currentReadSurface = read;
    EGL.setErrorCode(12288);
    return 1
}

function _eglQuerySurface(display, surface, attribute, value) {
    if (display != 62e3) {
        EGL.setErrorCode(12296);
        return 0
    }
    if (surface != 62006) {
        EGL.setErrorCode(12301);
        return 0
    }
    if (!value) {
        EGL.setErrorCode(12300);
        return 0
    }
    EGL.setErrorCode(12288);
    switch (attribute) {
        case 12328:
            HEAP32[value >> 2] = 62002;
            return 1;
        case 12376:
            return 1;
        case 12375:
            HEAP32[value >> 2] = Module.canvas.width;
            return 1;
        case 12374:
            HEAP32[value >> 2] = Module.canvas.height;
            return 1;
        case 12432:
            HEAP32[value >> 2] = -1;
            return 1;
        case 12433:
            HEAP32[value >> 2] = -1;
            return 1;
        case 12434:
            HEAP32[value >> 2] = -1;
            return 1;
        case 12422:
            HEAP32[value >> 2] = 12420;
            return 1;
        case 12441:
            HEAP32[value >> 2] = 12442;
            return 1;
        case 12435:
            HEAP32[value >> 2] = 12437;
            return 1;
        case 12416:
        case 12417:
        case 12418:
        case 12419:
            return 1;
        default:
            EGL.setErrorCode(12292);
            return 0
    }
}

function _eglSwapBuffers() {
    if (!EGL.defaultDisplayInitialized) {
        EGL.setErrorCode(12289)
    } else if (!Module.ctx) {
        EGL.setErrorCode(12290)
    } else if (Module.ctx.isContextLost()) {
        EGL.setErrorCode(12302)
    } else {
        EGL.setErrorCode(12288);
        return 1
    }
    return 0
}

function _eglTerminate(display) {
    if (display != 62e3) {
        EGL.setErrorCode(12296);
        return 0
    }
    EGL.currentContext = 0;
    EGL.currentReadSurface = 0;
    EGL.currentDrawSurface = 0;
    EGL.defaultDisplayInitialized = false;
    EGL.setErrorCode(12288);
    return 1
}
var JSEvents = {
    keyEvent: 0,
    mouseEvent: 0,
    wheelEvent: 0,
    uiEvent: 0,
    focusEvent: 0,
    deviceOrientationEvent: 0,
    deviceMotionEvent: 0,
    fullscreenChangeEvent: 0,
    pointerlockChangeEvent: 0,
    visibilityChangeEvent: 0,
    touchEvent: 0,
    lastGamepadState: null,
    lastGamepadStateFrame: null,
    numGamepadsConnected: 0,
    previousFullscreenElement: null,
    previousScreenX: null,
    previousScreenY: null,
    removeEventListenersRegistered: false,
    staticInit: (function() {
        if (typeof window !== "undefined") {
            window.addEventListener("gamepadconnected", (function() {
                ++JSEvents.numGamepadsConnected
            }));
            window.addEventListener("gamepaddisconnected", (function() {
                --JSEvents.numGamepadsConnected
            }));
            var firstState = navigator.getGamepads ? navigator.getGamepads() : navigator.webkitGetGamepads ? navigator.webkitGetGamepads() : null;
            if (firstState) {
                JSEvents.numGamepadsConnected = firstState.length
            }
        }
    }),
    registerRemoveEventListeners: (function() {
        if (!JSEvents.removeEventListenersRegistered) {
            __ATEXIT__.push((function() {
                for (var i = JSEvents.eventHandlers.length - 1; i >= 0; --i) {
                    JSEvents._removeHandler(i)
                }
            }));
            JSEvents.removeEventListenersRegistered = true
        }
    }),
    findEventTarget: (function(target) {
        if (target) {
            if (typeof target == "number") {
                target = Pointer_stringify(target)
            }
            if (target == "#window") return window;
            else if (target == "#document") return document;
            else if (target == "#screen") return window.screen;
            else if (target == "#canvas") return Module["canvas"];
            if (typeof target == "string") return document.getElementById(target);
            else return target
        } else {
            return window
        }
    }),
    deferredCalls: [],
    deferCall: (function(targetFunction, precedence, argsList) {
        function arraysHaveEqualContent(arrA, arrB) {
            if (arrA.length != arrB.length) return false;
            for (var i in arrA) {
                if (arrA[i] != arrB[i]) return false
            }
            return true
        }
        for (var i in JSEvents.deferredCalls) {
            var call = JSEvents.deferredCalls[i];
            if (call.targetFunction == targetFunction && arraysHaveEqualContent(call.argsList, argsList)) {
                return
            }
        }
        JSEvents.deferredCalls.push({
            targetFunction: targetFunction,
            precedence: precedence,
            argsList: argsList
        });
        JSEvents.deferredCalls.sort((function(x, y) {
            return x.precedence < y.precedence
        }))
    }),
    removeDeferredCalls: (function(targetFunction) {
        for (var i = 0; i < JSEvents.deferredCalls.length; ++i) {
            if (JSEvents.deferredCalls[i].targetFunction == targetFunction) {
                JSEvents.deferredCalls.splice(i, 1);
                --i
            }
        }
    }),
    canPerformEventHandlerRequests: (function() {
        return JSEvents.inEventHandler && JSEvents.currentEventHandler.allowsDeferredCalls
    }),
    runDeferredCalls: (function() {
        if (!JSEvents.canPerformEventHandlerRequests()) {
            return
        }
        for (var i = 0; i < JSEvents.deferredCalls.length; ++i) {
            var call = JSEvents.deferredCalls[i];
            JSEvents.deferredCalls.splice(i, 1);
            --i;
            call.targetFunction.apply(this, call.argsList)
        }
    }),
    inEventHandler: 0,
    currentEventHandler: null,
    eventHandlers: [],
    isInternetExplorer: (function() {
        return navigator.userAgent.indexOf("MSIE") !== -1 || navigator.appVersion.indexOf("Trident/") > 0
    }),
    removeAllHandlersOnTarget: (function(target, eventTypeString) {
        for (var i = 0; i < JSEvents.eventHandlers.length; ++i) {
            if (JSEvents.eventHandlers[i].target == target && (!eventTypeString || eventTypeString == JSEvents.eventHandlers[i].eventTypeString)) {
                JSEvents._removeHandler(i--)
            }
        }
    }),
    _removeHandler: (function(i) {
        var h = JSEvents.eventHandlers[i];
        h.target.removeEventListener(h.eventTypeString, h.eventListenerFunc, h.useCapture);
        JSEvents.eventHandlers.splice(i, 1)
    }),
    registerOrRemoveHandler: (function(eventHandler) {
        var jsEventHandler = function jsEventHandler(event) {
            ++JSEvents.inEventHandler;
            JSEvents.currentEventHandler = eventHandler;
            JSEvents.runDeferredCalls();
            eventHandler.handlerFunc(event);
            JSEvents.runDeferredCalls();
            --JSEvents.inEventHandler
        };
        if (eventHandler.callbackfunc) {
            eventHandler.eventListenerFunc = jsEventHandler;
            eventHandler.target.addEventListener(eventHandler.eventTypeString, jsEventHandler, eventHandler.useCapture);
            JSEvents.eventHandlers.push(eventHandler);
            JSEvents.registerRemoveEventListeners()
        } else {
            for (var i = 0; i < JSEvents.eventHandlers.length; ++i) {
                if (JSEvents.eventHandlers[i].target == eventHandler.target && JSEvents.eventHandlers[i].eventTypeString == eventHandler.eventTypeString) {
                    JSEvents._removeHandler(i--)
                }
            }
        }
    }),
    registerKeyEventCallback: (function(target, userData, useCapture, callbackfunc, eventTypeId, eventTypeString) {
        if (!JSEvents.keyEvent) {
            JSEvents.keyEvent = _malloc(164)
        }
        var handlerFunc = (function(event) {
            var e = event || window.event;
            stringToUTF8(e.key ? e.key : "", JSEvents.keyEvent + 0, 32);
            stringToUTF8(e.code ? e.code : "", JSEvents.keyEvent + 32, 32);
            HEAP32[JSEvents.keyEvent + 64 >> 2] = e.location;
            HEAP32[JSEvents.keyEvent + 68 >> 2] = e.ctrlKey;
            HEAP32[JSEvents.keyEvent + 72 >> 2] = e.shiftKey;
            HEAP32[JSEvents.keyEvent + 76 >> 2] = e.altKey;
            HEAP32[JSEvents.keyEvent + 80 >> 2] = e.metaKey;
            HEAP32[JSEvents.keyEvent + 84 >> 2] = e.repeat;
            stringToUTF8(e.locale ? e.locale : "", JSEvents.keyEvent + 88, 32);
            stringToUTF8(e.char ? e.char : "", JSEvents.keyEvent + 120, 32);
            HEAP32[JSEvents.keyEvent + 152 >> 2] = e.charCode;
            HEAP32[JSEvents.keyEvent + 156 >> 2] = e.keyCode;
            HEAP32[JSEvents.keyEvent + 160 >> 2] = e.which;
            var shouldCancel = Module["dynCall_iiii"](callbackfunc, eventTypeId, JSEvents.keyEvent, userData);
            if (shouldCancel) {
                e.preventDefault()
            }
        });
        var eventHandler = {
            target: JSEvents.findEventTarget(target),
            allowsDeferredCalls: JSEvents.isInternetExplorer() ? false : true,
            eventTypeString: eventTypeString,
            callbackfunc: callbackfunc,
            handlerFunc: handlerFunc,
            useCapture: useCapture
        };
        JSEvents.registerOrRemoveHandler(eventHandler)
    }),
    getBoundingClientRectOrZeros: (function(target) {
        return target.getBoundingClientRect ? target.getBoundingClientRect() : {
            left: 0,
            top: 0
        }
    }),
    fillMouseEventData: (function(eventStruct, e, target) {
        HEAPF64[eventStruct >> 3] = JSEvents.tick();
        HEAP32[eventStruct + 8 >> 2] = e.screenX;
        HEAP32[eventStruct + 12 >> 2] = e.screenY;
        HEAP32[eventStruct + 16 >> 2] = e.clientX;
        HEAP32[eventStruct + 20 >> 2] = e.clientY;
        HEAP32[eventStruct + 24 >> 2] = e.ctrlKey;
        HEAP32[eventStruct + 28 >> 2] = e.shiftKey;
        HEAP32[eventStruct + 32 >> 2] = e.altKey;
        HEAP32[eventStruct + 36 >> 2] = e.metaKey;
        HEAP16[eventStruct + 40 >> 1] = e.button;
        HEAP16[eventStruct + 42 >> 1] = e.buttons;
        HEAP32[eventStruct + 44 >> 2] = e["movementX"] || e["mozMovementX"] || e["webkitMovementX"] || e.screenX - JSEvents.previousScreenX;
        HEAP32[eventStruct + 48 >> 2] = e["movementY"] || e["mozMovementY"] || e["webkitMovementY"] || e.screenY - JSEvents.previousScreenY;
        if (Module["canvas"]) {
            var rect = Module["canvas"].getBoundingClientRect();
            HEAP32[eventStruct + 60 >> 2] = e.clientX - rect.left;
            HEAP32[eventStruct + 64 >> 2] = e.clientY - rect.top
        } else {
            HEAP32[eventStruct + 60 >> 2] = 0;
            HEAP32[eventStruct + 64 >> 2] = 0
        }
        if (target) {
            var rect = JSEvents.getBoundingClientRectOrZeros(target);
            HEAP32[eventStruct + 52 >> 2] = e.clientX - rect.left;
            HEAP32[eventStruct + 56 >> 2] = e.clientY - rect.top
        } else {
            HEAP32[eventStruct + 52 >> 2] = 0;
            HEAP32[eventStruct + 56 >> 2] = 0
        }
        if (e.type !== "wheel" && e.type !== "mousewheel") {
            JSEvents.previousScreenX = e.screenX;
            JSEvents.previousScreenY = e.screenY
        }
    }),
    registerMouseEventCallback: (function(target, userData, useCapture, callbackfunc, eventTypeId, eventTypeString) {
        if (!JSEvents.mouseEvent) {
            JSEvents.mouseEvent = _malloc(72)
        }
        target = JSEvents.findEventTarget(target);
        var handlerFunc = (function(event) {
            var e = event || window.event;
            JSEvents.fillMouseEventData(JSEvents.mouseEvent, e, target);
            var shouldCancel = Module["dynCall_iiii"](callbackfunc, eventTypeId, JSEvents.mouseEvent, userData);
            if (shouldCancel) {
                e.preventDefault()
            }
        });
        var eventHandler = {
            target: target,
            allowsDeferredCalls: eventTypeString != "mousemove" && eventTypeString != "mouseenter" && eventTypeString != "mouseleave",
            eventTypeString: eventTypeString,
            callbackfunc: callbackfunc,
            handlerFunc: handlerFunc,
            useCapture: useCapture
        };
        if (JSEvents.isInternetExplorer() && eventTypeString == "mousedown") eventHandler.allowsDeferredCalls = false;
        JSEvents.registerOrRemoveHandler(eventHandler)
    }),
    registerWheelEventCallback: (function(target, userData, useCapture, callbackfunc, eventTypeId, eventTypeString) {
        if (!JSEvents.wheelEvent) {
            JSEvents.wheelEvent = _malloc(104)
        }
        target = JSEvents.findEventTarget(target);
        var wheelHandlerFunc = (function(event) {
            var e = event || window.event;
            JSEvents.fillMouseEventData(JSEvents.wheelEvent, e, target);
            HEAPF64[JSEvents.wheelEvent + 72 >> 3] = e["deltaX"];
            HEAPF64[JSEvents.wheelEvent + 80 >> 3] = e["deltaY"];
            HEAPF64[JSEvents.wheelEvent + 88 >> 3] = e["deltaZ"];
            HEAP32[JSEvents.wheelEvent + 96 >> 2] = e["deltaMode"];
            var shouldCancel = Module["dynCall_iiii"](callbackfunc, eventTypeId, JSEvents.wheelEvent, userData);
            if (shouldCancel) {
                e.preventDefault()
            }
        });
        var mouseWheelHandlerFunc = (function(event) {
            var e = event || window.event;
            JSEvents.fillMouseEventData(JSEvents.wheelEvent, e, target);
            HEAPF64[JSEvents.wheelEvent + 72 >> 3] = e["wheelDeltaX"] || 0;
            HEAPF64[JSEvents.wheelEvent + 80 >> 3] = -(e["wheelDeltaY"] ? e["wheelDeltaY"] : e["wheelDelta"]);
            HEAPF64[JSEvents.wheelEvent + 88 >> 3] = 0;
            HEAP32[JSEvents.wheelEvent + 96 >> 2] = 0;
            var shouldCancel = Module["dynCall_iiii"](callbackfunc, eventTypeId, JSEvents.wheelEvent, userData);
            if (shouldCancel) {
                e.preventDefault()
            }
        });
        var eventHandler = {
            target: target,
            allowsDeferredCalls: true,
            eventTypeString: eventTypeString,
            callbackfunc: callbackfunc,
            handlerFunc: eventTypeString == "wheel" ? wheelHandlerFunc : mouseWheelHandlerFunc,
            useCapture: useCapture
        };
        JSEvents.registerOrRemoveHandler(eventHandler)
    }),
    pageScrollPos: (function() {
        if (window.pageXOffset > 0 || window.pageYOffset > 0) {
            return [window.pageXOffset, window.pageYOffset]
        }
        if (typeof document.documentElement.scrollLeft !== "undefined" || typeof document.documentElement.scrollTop !== "undefined") {
            return [document.documentElement.scrollLeft, document.documentElement.scrollTop]
        }
        return [document.body.scrollLeft | 0, document.body.scrollTop | 0]
    }),
    registerUiEventCallback: (function(target, userData, useCapture, callbackfunc, eventTypeId, eventTypeString) {
        if (!JSEvents.uiEvent) {
            JSEvents.uiEvent = _malloc(36)
        }
        if (eventTypeString == "scroll" && !target) {
            target = document
        } else {
            target = JSEvents.findEventTarget(target)
        }
        var handlerFunc = (function(event) {
            var e = event || window.event;
            if (e.target != target) {
                return
            }
            var scrollPos = JSEvents.pageScrollPos();
            HEAP32[JSEvents.uiEvent >> 2] = e.detail;
            HEAP32[JSEvents.uiEvent + 4 >> 2] = document.body.clientWidth;
            HEAP32[JSEvents.uiEvent + 8 >> 2] = document.body.clientHeight;
            HEAP32[JSEvents.uiEvent + 12 >> 2] = window.innerWidth;
            HEAP32[JSEvents.uiEvent + 16 >> 2] = window.innerHeight;
            HEAP32[JSEvents.uiEvent + 20 >> 2] = window.outerWidth;
            HEAP32[JSEvents.uiEvent + 24 >> 2] = window.outerHeight;
            HEAP32[JSEvents.uiEvent + 28 >> 2] = scrollPos[0];
            HEAP32[JSEvents.uiEvent + 32 >> 2] = scrollPos[1];
            var shouldCancel = Module["dynCall_iiii"](callbackfunc, eventTypeId, JSEvents.uiEvent, userData);
            if (shouldCancel) {
                e.preventDefault()
            }
        });
        var eventHandler = {
            target: target,
            allowsDeferredCalls: false,
            eventTypeString: eventTypeString,
            callbackfunc: callbackfunc,
            handlerFunc: handlerFunc,
            useCapture: useCapture
        };
        JSEvents.registerOrRemoveHandler(eventHandler)
    }),
    getNodeNameForTarget: (function(target) {
        if (!target) return "";
        if (target == window) return "#window";
        if (target == window.screen) return "#screen";
        return target && target.nodeName ? target.nodeName : ""
    }),
    registerFocusEventCallback: (function(target, userData, useCapture, callbackfunc, eventTypeId, eventTypeString) {
        if (!JSEvents.focusEvent) {
            JSEvents.focusEvent = _malloc(256)
        }
        var handlerFunc = (function(event) {
            var e = event || window.event;
            var nodeName = JSEvents.getNodeNameForTarget(e.target);
            var id = e.target.id ? e.target.id : "";
            stringToUTF8(nodeName, JSEvents.focusEvent + 0, 128);
            stringToUTF8(id, JSEvents.focusEvent + 128, 128);
            var shouldCancel = Module["dynCall_iiii"](callbackfunc, eventTypeId, JSEvents.focusEvent, userData);
            if (shouldCancel) {
                e.preventDefault()
            }
        });
        var eventHandler = {
            target: JSEvents.findEventTarget(target),
            allowsDeferredCalls: false,
            eventTypeString: eventTypeString,
            callbackfunc: callbackfunc,
            handlerFunc: handlerFunc,
            useCapture: useCapture
        };
        JSEvents.registerOrRemoveHandler(eventHandler)
    }),
    tick: (function() {
        if (window["performance"] && window["performance"]["now"]) return window["performance"]["now"]();
        else return Date.now()
    }),
    registerDeviceOrientationEventCallback: (function(target, userData, useCapture, callbackfunc, eventTypeId, eventTypeString) {
        if (!JSEvents.deviceOrientationEvent) {
            JSEvents.deviceOrientationEvent = _malloc(40)
        }
        var handlerFunc = (function(event) {
            var e = event || window.event;
            HEAPF64[JSEvents.deviceOrientationEvent >> 3] = JSEvents.tick();
            HEAPF64[JSEvents.deviceOrientationEvent + 8 >> 3] = e.alpha;
            HEAPF64[JSEvents.deviceOrientationEvent + 16 >> 3] = e.beta;
            HEAPF64[JSEvents.deviceOrientationEvent + 24 >> 3] = e.gamma;
            HEAP32[JSEvents.deviceOrientationEvent + 32 >> 2] = e.absolute;
            var shouldCancel = Module["dynCall_iiii"](callbackfunc, eventTypeId, JSEvents.deviceOrientationEvent, userData);
            if (shouldCancel) {
                e.preventDefault()
            }
        });
        var eventHandler = {
            target: JSEvents.findEventTarget(target),
            allowsDeferredCalls: false,
            eventTypeString: eventTypeString,
            callbackfunc: callbackfunc,
            handlerFunc: handlerFunc,
            useCapture: useCapture
        };
        JSEvents.registerOrRemoveHandler(eventHandler)
    }),
    registerDeviceMotionEventCallback: (function(target, userData, useCapture, callbackfunc, eventTypeId, eventTypeString) {
        if (!JSEvents.deviceMotionEvent) {
            JSEvents.deviceMotionEvent = _malloc(80)
        }
        var handlerFunc = (function(event) {
            var e = event || window.event;
            HEAPF64[JSEvents.deviceMotionEvent >> 3] = JSEvents.tick();
            HEAPF64[JSEvents.deviceMotionEvent + 8 >> 3] = e.acceleration.x;
            HEAPF64[JSEvents.deviceMotionEvent + 16 >> 3] = e.acceleration.y;
            HEAPF64[JSEvents.deviceMotionEvent + 24 >> 3] = e.acceleration.z;
            HEAPF64[JSEvents.deviceMotionEvent + 32 >> 3] = e.accelerationIncludingGravity.x;
            HEAPF64[JSEvents.deviceMotionEvent + 40 >> 3] = e.accelerationIncludingGravity.y;
            HEAPF64[JSEvents.deviceMotionEvent + 48 >> 3] = e.accelerationIncludingGravity.z;
            HEAPF64[JSEvents.deviceMotionEvent + 56 >> 3] = e.rotationRate.alpha;
            HEAPF64[JSEvents.deviceMotionEvent + 64 >> 3] = e.rotationRate.beta;
            HEAPF64[JSEvents.deviceMotionEvent + 72 >> 3] = e.rotationRate.gamma;
            var shouldCancel = Module["dynCall_iiii"](callbackfunc, eventTypeId, JSEvents.deviceMotionEvent, userData);
            if (shouldCancel) {
                e.preventDefault()
            }
        });
        var eventHandler = {
            target: JSEvents.findEventTarget(target),
            allowsDeferredCalls: false,
            eventTypeString: eventTypeString,
            callbackfunc: callbackfunc,
            handlerFunc: handlerFunc,
            useCapture: useCapture
        };
        JSEvents.registerOrRemoveHandler(eventHandler)
    }),
    screenOrientation: (function() {
        if (!window.screen) return undefined;
        return window.screen.orientation || window.screen.mozOrientation || window.screen.webkitOrientation || window.screen.msOrientation
    }),
    fillOrientationChangeEventData: (function(eventStruct, e) {
        var orientations = ["portrait-primary", "portrait-secondary", "landscape-primary", "landscape-secondary"];
        var orientations2 = ["portrait", "portrait", "landscape", "landscape"];
        var orientationString = JSEvents.screenOrientation();
        var orientation = orientations.indexOf(orientationString);
        if (orientation == -1) {
            orientation = orientations2.indexOf(orientationString)
        }
        HEAP32[eventStruct >> 2] = 1 << orientation;
        HEAP32[eventStruct + 4 >> 2] = window.orientation
    }),
    registerOrientationChangeEventCallback: (function(target, userData, useCapture, callbackfunc, eventTypeId, eventTypeString) {
        if (!JSEvents.orientationChangeEvent) {
            JSEvents.orientationChangeEvent = _malloc(8)
        }
        if (!target) {
            target = window.screen
        } else {
            target = JSEvents.findEventTarget(target)
        }
        var handlerFunc = (function(event) {
            var e = event || window.event;
            JSEvents.fillOrientationChangeEventData(JSEvents.orientationChangeEvent, e);
            var shouldCancel = Module["dynCall_iiii"](callbackfunc, eventTypeId, JSEvents.orientationChangeEvent, userData);
            if (shouldCancel) {
                e.preventDefault()
            }
        });
        if (eventTypeString == "orientationchange" && window.screen.mozOrientation !== undefined) {
            eventTypeString = "mozorientationchange"
        }
        var eventHandler = {
            target: target,
            allowsDeferredCalls: false,
            eventTypeString: eventTypeString,
            callbackfunc: callbackfunc,
            handlerFunc: handlerFunc,
            useCapture: useCapture
        };
        JSEvents.registerOrRemoveHandler(eventHandler)
    }),
    fullscreenEnabled: (function() {
        return document.fullscreenEnabled || document.mozFullScreenEnabled || document.webkitFullscreenEnabled || document.msFullscreenEnabled
    }),
    fillFullscreenChangeEventData: (function(eventStruct, e) {
        var fullscreenElement = document.fullscreenElement || document.mozFullScreenElement || document.webkitFullscreenElement || document.msFullscreenElement;
        var isFullscreen = !!fullscreenElement;
        HEAP32[eventStruct >> 2] = isFullscreen;
        HEAP32[eventStruct + 4 >> 2] = JSEvents.fullscreenEnabled();
        var reportedElement = isFullscreen ? fullscreenElement : JSEvents.previousFullscreenElement;
        var nodeName = JSEvents.getNodeNameForTarget(reportedElement);
        var id = reportedElement && reportedElement.id ? reportedElement.id : "";
        stringToUTF8(nodeName, eventStruct + 8, 128);
        stringToUTF8(id, eventStruct + 136, 128);
        HEAP32[eventStruct + 264 >> 2] = reportedElement ? reportedElement.clientWidth : 0;
        HEAP32[eventStruct + 268 >> 2] = reportedElement ? reportedElement.clientHeight : 0;
        HEAP32[eventStruct + 272 >> 2] = screen.width;
        HEAP32[eventStruct + 276 >> 2] = screen.height;
        if (isFullscreen) {
            JSEvents.previousFullscreenElement = fullscreenElement
        }
    }),
    registerFullscreenChangeEventCallback: (function(target, userData, useCapture, callbackfunc, eventTypeId, eventTypeString) {
        if (!JSEvents.fullscreenChangeEvent) {
            JSEvents.fullscreenChangeEvent = _malloc(280)
        }
        if (!target) {
            target = document
        } else {
            target = JSEvents.findEventTarget(target)
        }
        var handlerFunc = (function(event) {
            var e = event || window.event;
            JSEvents.fillFullscreenChangeEventData(JSEvents.fullscreenChangeEvent, e);
            var shouldCancel = Module["dynCall_iiii"](callbackfunc, eventTypeId, JSEvents.fullscreenChangeEvent, userData);
            if (shouldCancel) {
                e.preventDefault()
            }
        });
        var eventHandler = {
            target: target,
            allowsDeferredCalls: false,
            eventTypeString: eventTypeString,
            callbackfunc: callbackfunc,
            handlerFunc: handlerFunc,
            useCapture: useCapture
        };
        JSEvents.registerOrRemoveHandler(eventHandler)
    }),
    resizeCanvasForFullscreen: (function(target, strategy) {
        var restoreOldStyle = __registerRestoreOldStyle(target);
        var cssWidth = strategy.softFullscreen ? window.innerWidth : screen.width;
        var cssHeight = strategy.softFullscreen ? window.innerHeight : screen.height;
        var rect = target.getBoundingClientRect();
        var windowedCssWidth = rect.right - rect.left;
        var windowedCssHeight = rect.bottom - rect.top;
        var windowedRttWidth = target.width;
        var windowedRttHeight = target.height;
        if (strategy.scaleMode == 3) {
            __setLetterbox(target, (cssHeight - windowedCssHeight) / 2, (cssWidth - windowedCssWidth) / 2);
            cssWidth = windowedCssWidth;
            cssHeight = windowedCssHeight
        } else if (strategy.scaleMode == 2) {
            if (cssWidth * windowedRttHeight < windowedRttWidth * cssHeight) {
                var desiredCssHeight = windowedRttHeight * cssWidth / windowedRttWidth;
                __setLetterbox(target, (cssHeight - desiredCssHeight) / 2, 0);
                cssHeight = desiredCssHeight
            } else {
                var desiredCssWidth = windowedRttWidth * cssHeight / windowedRttHeight;
                __setLetterbox(target, 0, (cssWidth - desiredCssWidth) / 2);
                cssWidth = desiredCssWidth
            }
        }
        if (!target.style.backgroundColor) target.style.backgroundColor = "black";
        if (!document.body.style.backgroundColor) document.body.style.backgroundColor = "black";
        target.style.width = cssWidth + "px";
        target.style.height = cssHeight + "px";
        if (strategy.filteringMode == 1) {
            target.style.imageRendering = "optimizeSpeed";
            target.style.imageRendering = "-moz-crisp-edges";
            target.style.imageRendering = "-o-crisp-edges";
            target.style.imageRendering = "-webkit-optimize-contrast";
            target.style.imageRendering = "optimize-contrast";
            target.style.imageRendering = "crisp-edges";
            target.style.imageRendering = "pixelated"
        }
        var dpiScale = strategy.canvasResolutionScaleMode == 2 ? window.devicePixelRatio : 1;
        if (strategy.canvasResolutionScaleMode != 0) {
            target.width = cssWidth * dpiScale;
            target.height = cssHeight * dpiScale;
            if (target.GLctxObject) target.GLctxObject.GLctx.viewport(0, 0, target.width, target.height)
        }
        return restoreOldStyle
    }),
    requestFullscreen: (function(target, strategy) {
        if (strategy.scaleMode != 0 || strategy.canvasResolutionScaleMode != 0) {
            JSEvents.resizeCanvasForFullscreen(target, strategy)
        }
        if (target.requestFullscreen) {
            target.requestFullscreen()
        } else if (target.msRequestFullscreen) {
            target.msRequestFullscreen()
        } else if (target.mozRequestFullScreen) {
            target.mozRequestFullScreen()
        } else if (target.mozRequestFullscreen) {
            target.mozRequestFullscreen()
        } else if (target.webkitRequestFullscreen) {
            target.webkitRequestFullscreen(Element.ALLOW_KEYBOARD_INPUT)
        } else {
            if (typeof JSEvents.fullscreenEnabled() === "undefined") {
                return -1
            } else {
                return -3
            }
        }
        if (strategy.canvasResizedCallback) {
            Module["dynCall_iiii"](strategy.canvasResizedCallback, 37, 0, strategy.canvasResizedCallbackUserData)
        }
        return 0
    }),
    fillPointerlockChangeEventData: (function(eventStruct, e) {
        var pointerLockElement = document.pointerLockElement || document.mozPointerLockElement || document.webkitPointerLockElement || document.msPointerLockElement;
        var isPointerlocked = !!pointerLockElement;
        HEAP32[eventStruct >> 2] = isPointerlocked;
        var nodeName = JSEvents.getNodeNameForTarget(pointerLockElement);
        var id = pointerLockElement && pointerLockElement.id ? pointerLockElement.id : "";
        stringToUTF8(nodeName, eventStruct + 4, 128);
        stringToUTF8(id, eventStruct + 132, 128)
    }),
    registerPointerlockChangeEventCallback: (function(target, userData, useCapture, callbackfunc, eventTypeId, eventTypeString) {
        if (!JSEvents.pointerlockChangeEvent) {
            JSEvents.pointerlockChangeEvent = _malloc(260)
        }
        if (!target) {
            target = document
        } else {
            target = JSEvents.findEventTarget(target)
        }
        var handlerFunc = (function(event) {
            var e = event || window.event;
            JSEvents.fillPointerlockChangeEventData(JSEvents.pointerlockChangeEvent, e);
            var shouldCancel = Module["dynCall_iiii"](callbackfunc, eventTypeId, JSEvents.pointerlockChangeEvent, userData);
            if (shouldCancel) {
                e.preventDefault()
            }
        });
        var eventHandler = {
            target: target,
            allowsDeferredCalls: false,
            eventTypeString: eventTypeString,
            callbackfunc: callbackfunc,
            handlerFunc: handlerFunc,
            useCapture: useCapture
        };
        JSEvents.registerOrRemoveHandler(eventHandler)
    }),
    registerPointerlockErrorEventCallback: (function(target, userData, useCapture, callbackfunc, eventTypeId, eventTypeString) {
        if (!target) {
            target = document
        } else {
            target = JSEvents.findEventTarget(target)
        }
        var handlerFunc = (function(event) {
            var e = event || window.event;
            var shouldCancel = Module["dynCall_iiii"](callbackfunc, eventTypeId, 0, userData);
            if (shouldCancel) {
                e.preventDefault()
            }
        });
        var eventHandler = {
            target: target,
            allowsDeferredCalls: false,
            eventTypeString: eventTypeString,
            callbackfunc: callbackfunc,
            handlerFunc: handlerFunc,
            useCapture: useCapture
        };
        JSEvents.registerOrRemoveHandler(eventHandler)
    }),
    requestPointerLock: (function(target) {
        if (target.requestPointerLock) {
            target.requestPointerLock()
        } else if (target.mozRequestPointerLock) {
            target.mozRequestPointerLock()
        } else if (target.webkitRequestPointerLock) {
            target.webkitRequestPointerLock()
        } else if (target.msRequestPointerLock) {
            target.msRequestPointerLock()
        } else {
            if (document.body.requestPointerLock || document.body.mozRequestPointerLock || document.body.webkitRequestPointerLock || document.body.msRequestPointerLock) {
                return -3
            } else {
                return -1
            }
        }
        return 0
    }),
    fillVisibilityChangeEventData: (function(eventStruct, e) {
        var visibilityStates = ["hidden", "visible", "prerender", "unloaded"];
        var visibilityState = visibilityStates.indexOf(document.visibilityState);
        HEAP32[eventStruct >> 2] = document.hidden;
        HEAP32[eventStruct + 4 >> 2] = visibilityState
    }),
    registerVisibilityChangeEventCallback: (function(target, userData, useCapture, callbackfunc, eventTypeId, eventTypeString) {
        if (!JSEvents.visibilityChangeEvent) {
            JSEvents.visibilityChangeEvent = _malloc(8)
        }
        if (!target) {
            target = document
        } else {
            target = JSEvents.findEventTarget(target)
        }
        var handlerFunc = (function(event) {
            var e = event || window.event;
            JSEvents.fillVisibilityChangeEventData(JSEvents.visibilityChangeEvent, e);
            var shouldCancel = Module["dynCall_iiii"](callbackfunc, eventTypeId, JSEvents.visibilityChangeEvent, userData);
            if (shouldCancel) {
                e.preventDefault()
            }
        });
        var eventHandler = {
            target: target,
            allowsDeferredCalls: false,
            eventTypeString: eventTypeString,
            callbackfunc: callbackfunc,
            handlerFunc: handlerFunc,
            useCapture: useCapture
        };
        JSEvents.registerOrRemoveHandler(eventHandler)
    }),
    registerTouchEventCallback: (function(target, userData, useCapture, callbackfunc, eventTypeId, eventTypeString) {
        if (!JSEvents.touchEvent) {
            JSEvents.touchEvent = _malloc(1684)
        }
        target = JSEvents.findEventTarget(target);
        var handlerFunc = (function(event) {
            var e = event || window.event;
            var touches = {};
            for (var i = 0; i < e.touches.length; ++i) {
                var touch = e.touches[i];
                touches[touch.identifier] = touch
            }
            for (var i = 0; i < e.changedTouches.length; ++i) {
                var touch = e.changedTouches[i];
                touches[touch.identifier] = touch;
                touch.changed = true
            }
            for (var i = 0; i < e.targetTouches.length; ++i) {
                var touch = e.targetTouches[i];
                touches[touch.identifier].onTarget = true
            }
            var ptr = JSEvents.touchEvent;
            HEAP32[ptr + 4 >> 2] = e.ctrlKey;
            HEAP32[ptr + 8 >> 2] = e.shiftKey;
            HEAP32[ptr + 12 >> 2] = e.altKey;
            HEAP32[ptr + 16 >> 2] = e.metaKey;
            ptr += 20;
            var canvasRect = Module["canvas"] ? Module["canvas"].getBoundingClientRect() : undefined;
            var targetRect = JSEvents.getBoundingClientRectOrZeros(target);
            var numTouches = 0;
            for (var i in touches) {
                var t = touches[i];
                HEAP32[ptr >> 2] = t.identifier;
                HEAP32[ptr + 4 >> 2] = t.screenX;
                HEAP32[ptr + 8 >> 2] = t.screenY;
                HEAP32[ptr + 12 >> 2] = t.clientX;
                HEAP32[ptr + 16 >> 2] = t.clientY;
                HEAP32[ptr + 20 >> 2] = t.pageX;
                HEAP32[ptr + 24 >> 2] = t.pageY;
                HEAP32[ptr + 28 >> 2] = t.changed;
                HEAP32[ptr + 32 >> 2] = t.onTarget;
                if (canvasRect) {
                    HEAP32[ptr + 44 >> 2] = t.clientX - canvasRect.left;
                    HEAP32[ptr + 48 >> 2] = t.clientY - canvasRect.top
                } else {
                    HEAP32[ptr + 44 >> 2] = 0;
                    HEAP32[ptr + 48 >> 2] = 0
                }
                HEAP32[ptr + 36 >> 2] = t.clientX - targetRect.left;
                HEAP32[ptr + 40 >> 2] = t.clientY - targetRect.top;
                ptr += 52;
                if (++numTouches >= 32) {
                    break
                }
            }
            HEAP32[JSEvents.touchEvent >> 2] = numTouches;
            var shouldCancel = Module["dynCall_iiii"](callbackfunc, eventTypeId, JSEvents.touchEvent, userData);
            if (shouldCancel) {
                e.preventDefault()
            }
        });
        var eventHandler = {
            target: target,
            allowsDeferredCalls: eventTypeString == "touchstart" || eventTypeString == "touchend",
            eventTypeString: eventTypeString,
            callbackfunc: callbackfunc,
            handlerFunc: handlerFunc,
            useCapture: useCapture
        };
        JSEvents.registerOrRemoveHandler(eventHandler)
    }),
    fillGamepadEventData: (function(eventStruct, e) {
        HEAPF64[eventStruct >> 3] = e.timestamp;
        for (var i = 0; i < e.axes.length; ++i) {
            HEAPF64[eventStruct + i * 8 + 16 >> 3] = e.axes[i]
        }
        for (var i = 0; i < e.buttons.length; ++i) {
            if (typeof e.buttons[i] === "object") {
                HEAPF64[eventStruct + i * 8 + 528 >> 3] = e.buttons[i].value
            } else {
                HEAPF64[eventStruct + i * 8 + 528 >> 3] = e.buttons[i]
            }
        }
        for (var i = 0; i < e.buttons.length; ++i) {
            if (typeof e.buttons[i] === "object") {
                HEAP32[eventStruct + i * 4 + 1040 >> 2] = e.buttons[i].pressed
            } else {
                HEAP32[eventStruct + i * 4 + 1040 >> 2] = e.buttons[i] == 1
            }
        }
        HEAP32[eventStruct + 1296 >> 2] = e.connected;
        HEAP32[eventStruct + 1300 >> 2] = e.index;
        HEAP32[eventStruct + 8 >> 2] = e.axes.length;
        HEAP32[eventStruct + 12 >> 2] = e.buttons.length;
        stringToUTF8(e.id, eventStruct + 1304, 64);
        stringToUTF8(e.mapping, eventStruct + 1368, 64)
    }),
    registerGamepadEventCallback: (function(target, userData, useCapture, callbackfunc, eventTypeId, eventTypeString) {
        if (!JSEvents.gamepadEvent) {
            JSEvents.gamepadEvent = _malloc(1432)
        }
        var handlerFunc = (function(event) {
            var e = event || window.event;
            JSEvents.fillGamepadEventData(JSEvents.gamepadEvent, e.gamepad);
            var shouldCancel = Module["dynCall_iiii"](callbackfunc, eventTypeId, JSEvents.gamepadEvent, userData);
            if (shouldCancel) {
                e.preventDefault()
            }
        });
        var eventHandler = {
            target: JSEvents.findEventTarget(target),
            allowsDeferredCalls: true,
            eventTypeString: eventTypeString,
            callbackfunc: callbackfunc,
            handlerFunc: handlerFunc,
            useCapture: useCapture
        };
        JSEvents.registerOrRemoveHandler(eventHandler)
    }),
    registerBeforeUnloadEventCallback: (function(target, userData, useCapture, callbackfunc, eventTypeId, eventTypeString) {
        var handlerFunc = (function(event) {
            var e = event || window.event;
            var confirmationMessage = Module["dynCall_iiii"](callbackfunc, eventTypeId, 0, userData);
            if (confirmationMessage) {
                confirmationMessage = Pointer_stringify(confirmationMessage)
            }
            if (confirmationMessage) {
                e.preventDefault();
                e.returnValue = confirmationMessage;
                return confirmationMessage
            }
        });
        var eventHandler = {
            target: JSEvents.findEventTarget(target),
            allowsDeferredCalls: false,
            eventTypeString: eventTypeString,
            callbackfunc: callbackfunc,
            handlerFunc: handlerFunc,
            useCapture: useCapture
        };
        JSEvents.registerOrRemoveHandler(eventHandler)
    }),
    battery: (function() {
        return navigator.battery || navigator.mozBattery || navigator.webkitBattery
    }),
    fillBatteryEventData: (function(eventStruct, e) {
        HEAPF64[eventStruct >> 3] = e.chargingTime;
        HEAPF64[eventStruct + 8 >> 3] = e.dischargingTime;
        HEAPF64[eventStruct + 16 >> 3] = e.level;
        HEAP32[eventStruct + 24 >> 2] = e.charging
    }),
    registerBatteryEventCallback: (function(target, userData, useCapture, callbackfunc, eventTypeId, eventTypeString) {
        if (!JSEvents.batteryEvent) {
            JSEvents.batteryEvent = _malloc(32)
        }
        var handlerFunc = (function(event) {
            var e = event || window.event;
            JSEvents.fillBatteryEventData(JSEvents.batteryEvent, JSEvents.battery());
            var shouldCancel = Module["dynCall_iiii"](callbackfunc, eventTypeId, JSEvents.batteryEvent, userData);
            if (shouldCancel) {
                e.preventDefault()
            }
        });
        var eventHandler = {
            target: JSEvents.findEventTarget(target),
            allowsDeferredCalls: false,
            eventTypeString: eventTypeString,
            callbackfunc: callbackfunc,
            handlerFunc: handlerFunc,
            useCapture: useCapture
        };
        JSEvents.registerOrRemoveHandler(eventHandler)
    }),
    registerWebGlEventCallback: (function(target, userData, useCapture, callbackfunc, eventTypeId, eventTypeString) {
        if (!target) {
            target = Module["canvas"]
        }
        var handlerFunc = (function(event) {
            var e = event || window.event;
            var shouldCancel = Module["dynCall_iiii"](callbackfunc, eventTypeId, 0, userData);
            if (shouldCancel) {
                e.preventDefault()
            }
        });
        var eventHandler = {
            target: JSEvents.findEventTarget(target),
            allowsDeferredCalls: false,
            eventTypeString: eventTypeString,
            callbackfunc: callbackfunc,
            handlerFunc: handlerFunc,
            useCapture: useCapture
        };
        JSEvents.registerOrRemoveHandler(eventHandler)
    })
};

function _emscripten_exit_pointerlock() {
    JSEvents.removeDeferredCalls(JSEvents.requestPointerLock);
    if (document.exitPointerLock) {
        document.exitPointerLock()
    } else if (document.msExitPointerLock) {
        document.msExitPointerLock()
    } else if (document.mozExitPointerLock) {
        document.mozExitPointerLock()
    } else if (document.webkitExitPointerLock) {
        document.webkitExitPointerLock()
    } else {
        return -1
    }
    return 0
}

function _emscripten_force_exit(status) {
    Module["noExitRuntime"] = false;
    Module["exit"](status)
}

function _emscripten_get_canvas_element_size(target, width, height) {
    if (target) target = JSEvents.findEventTarget(target);
    else target = Module["canvas"];
    if (!target) return -4;
    HEAP32[width >> 2] = target.width;
    HEAP32[height >> 2] = target.height;
    return 0
}

function _emscripten_get_fullscreen_status(fullscreenStatus) {
    if (typeof JSEvents.fullscreenEnabled() === "undefined") return -1;
    JSEvents.fillFullscreenChangeEventData(fullscreenStatus);
    return 0
}

function __emscripten_sample_gamepad_data() {
    if (!JSEvents.numGamepadsConnected) return;
    if (Browser.mainLoop.currentFrameNumber !== JSEvents.lastGamepadStateFrame || !Browser.mainLoop.currentFrameNumber) {
        JSEvents.lastGamepadState = navigator.getGamepads ? navigator.getGamepads() : navigator.webkitGetGamepads ? navigator.webkitGetGamepads : null;
        JSEvents.lastGamepadStateFrame = Browser.mainLoop.currentFrameNumber
    }
}

function _emscripten_get_gamepad_status(index, gamepadState) {
    __emscripten_sample_gamepad_data();
    if (!JSEvents.lastGamepadState) return -1;
    if (index < 0 || index >= JSEvents.lastGamepadState.length) return -5;
    if (!JSEvents.lastGamepadState[index]) return -7;
    JSEvents.fillGamepadEventData(gamepadState, JSEvents.lastGamepadState[index]);
    return 0
}

function _emscripten_get_num_gamepads() {
    if (!JSEvents.numGamepadsConnected) return 0;
    __emscripten_sample_gamepad_data();
    if (!JSEvents.lastGamepadState) return -1;
    return JSEvents.lastGamepadState.length
}

function _emscripten_glActiveTexture(x0) {
    GLctx["activeTexture"](x0)
}

function _emscripten_glAttachShader(program, shader) {
    GLctx.attachShader(GL.programs[program], GL.shaders[shader])
}

function _emscripten_glBindAttribLocation(program, index, name) {
    name = Pointer_stringify(name);
    GLctx.bindAttribLocation(GL.programs[program], index, name)
}

function _emscripten_glBindBuffer(target, buffer) {
    var bufferObj = buffer ? GL.buffers[buffer] : null;
    if (target == GLctx.ARRAY_BUFFER) {
        GL.currArrayBuffer = buffer
    } else if (target == GLctx.ELEMENT_ARRAY_BUFFER) {
        GL.currElementArrayBuffer = buffer
    }
    GLctx.bindBuffer(target, bufferObj)
}

function _emscripten_glBindFramebuffer(target, framebuffer) {
    GLctx.bindFramebuffer(target, framebuffer ? GL.framebuffers[framebuffer] : null)
}

function _emscripten_glBindProgramARB() {
    Module["printErr"]("missing function: emscripten_glBindProgramARB");
    abort(-1)
}

function _emscripten_glBindRenderbuffer(target, renderbuffer) {
    GLctx.bindRenderbuffer(target, renderbuffer ? GL.renderbuffers[renderbuffer] : null)
}

function _emscripten_glBindTexture(target, texture) {
    GLctx.bindTexture(target, texture ? GL.textures[texture] : null)
}

function _emscripten_glBindVertexArray(vao) {
    GLctx["bindVertexArray"](GL.vaos[vao]);
    var ibo = GLctx.getParameter(GLctx.ELEMENT_ARRAY_BUFFER_BINDING);
    GL.currElementArrayBuffer = ibo ? ibo.name | 0 : 0
}

function _emscripten_glBlendColor(x0, x1, x2, x3) {
    GLctx["blendColor"](x0, x1, x2, x3)
}

function _emscripten_glBlendEquation(x0) {
    GLctx["blendEquation"](x0)
}

function _emscripten_glBlendEquationSeparate(x0, x1) {
    GLctx["blendEquationSeparate"](x0, x1)
}

function _emscripten_glBlendFunc(x0, x1) {
    GLctx["blendFunc"](x0, x1)
}

function _emscripten_glBlendFuncSeparate(x0, x1, x2, x3) {
    GLctx["blendFuncSeparate"](x0, x1, x2, x3)
}

function _emscripten_glBufferData(target, size, data, usage) {
    if (!data) {
        GLctx.bufferData(target, size, usage)
    } else {
        GLctx.bufferData(target, HEAPU8.subarray(data, data + size), usage)
    }
}

function _emscripten_glBufferSubData(target, offset, size, data) {
    GLctx.bufferSubData(target, offset, HEAPU8.subarray(data, data + size))
}

function _emscripten_glCheckFramebufferStatus(x0) {
    return GLctx["checkFramebufferStatus"](x0)
}

function _emscripten_glClear(x0) {
    GLctx["clear"](x0)
}

function _emscripten_glClearColor(x0, x1, x2, x3) {
    GLctx["clearColor"](x0, x1, x2, x3)
}

function _emscripten_glClearDepth(x0) {
    GLctx["clearDepth"](x0)
}

function _emscripten_glClearDepthf(x0) {
    GLctx["clearDepth"](x0)
}

function _emscripten_glClearStencil(x0) {
    GLctx["clearStencil"](x0)
}

function _emscripten_glClientActiveTexture() {
    Module["printErr"]("missing function: emscripten_glClientActiveTexture");
    abort(-1)
}

function _emscripten_glColorMask(red, green, blue, alpha) {
    GLctx.colorMask(!!red, !!green, !!blue, !!alpha)
}

function _emscripten_glColorPointer() {
    Module["printErr"]("missing function: emscripten_glColorPointer");
    abort(-1)
}

function _emscripten_glCompileShader(shader) {
    GLctx.compileShader(GL.shaders[shader])
}

function _emscripten_glCompressedTexImage2D(target, level, internalFormat, width, height, border, imageSize, data) {
    GLctx["compressedTexImage2D"](target, level, internalFormat, width, height, border, data ? HEAPU8.subarray(data, data + imageSize) : null)
}

function _emscripten_glCompressedTexSubImage2D(target, level, xoffset, yoffset, width, height, format, imageSize, data) {
    GLctx["compressedTexSubImage2D"](target, level, xoffset, yoffset, width, height, format, data ? HEAPU8.subarray(data, data + imageSize) : null)
}

function _emscripten_glCopyTexImage2D(x0, x1, x2, x3, x4, x5, x6, x7) {
    GLctx["copyTexImage2D"](x0, x1, x2, x3, x4, x5, x6, x7)
}

function _emscripten_glCopyTexSubImage2D(x0, x1, x2, x3, x4, x5, x6, x7) {
    GLctx["copyTexSubImage2D"](x0, x1, x2, x3, x4, x5, x6, x7)
}

function _emscripten_glCreateProgram() {
    var id = GL.getNewId(GL.programs);
    var program = GLctx.createProgram();
    program.name = id;
    GL.programs[id] = program;
    return id
}

function _emscripten_glCreateShader(shaderType) {
    var id = GL.getNewId(GL.shaders);
    GL.shaders[id] = GLctx.createShader(shaderType);
    return id
}

function _emscripten_glCullFace(x0) {
    GLctx["cullFace"](x0)
}

function _emscripten_glDeleteBuffers(n, buffers) {
    for (var i = 0; i < n; i++) {
        var id = HEAP32[buffers + i * 4 >> 2];
        var buffer = GL.buffers[id];
        if (!buffer) continue;
        GLctx.deleteBuffer(buffer);
        buffer.name = 0;
        GL.buffers[id] = null;
        if (id == GL.currArrayBuffer) GL.currArrayBuffer = 0;
        if (id == GL.currElementArrayBuffer) GL.currElementArrayBuffer = 0
    }
}

function _emscripten_glDeleteFramebuffers(n, framebuffers) {
    for (var i = 0; i < n; ++i) {
        var id = HEAP32[framebuffers + i * 4 >> 2];
        var framebuffer = GL.framebuffers[id];
        if (!framebuffer) continue;
        GLctx.deleteFramebuffer(framebuffer);
        framebuffer.name = 0;
        GL.framebuffers[id] = null
    }
}

function _emscripten_glDeleteObjectARB() {
    Module["printErr"]("missing function: emscripten_glDeleteObjectARB");
    abort(-1)
}

function _emscripten_glDeleteProgram(id) {
    if (!id) return;
    var program = GL.programs[id];
    if (!program) {
        GL.recordError(1281);
        return
    }
    GLctx.deleteProgram(program);
    program.name = 0;
    GL.programs[id] = null;
    GL.programInfos[id] = null
}

function _emscripten_glDeleteRenderbuffers(n, renderbuffers) {
    for (var i = 0; i < n; i++) {
        var id = HEAP32[renderbuffers + i * 4 >> 2];
        var renderbuffer = GL.renderbuffers[id];
        if (!renderbuffer) continue;
        GLctx.deleteRenderbuffer(renderbuffer);
        renderbuffer.name = 0;
        GL.renderbuffers[id] = null
    }
}

function _emscripten_glDeleteShader(id) {
    if (!id) return;
    var shader = GL.shaders[id];
    if (!shader) {
        GL.recordError(1281);
        return
    }
    GLctx.deleteShader(shader);
    GL.shaders[id] = null
}

function _emscripten_glDeleteTextures(n, textures) {
    for (var i = 0; i < n; i++) {
        var id = HEAP32[textures + i * 4 >> 2];
        var texture = GL.textures[id];
        if (!texture) continue;
        GLctx.deleteTexture(texture);
        texture.name = 0;
        GL.textures[id] = null
    }
}

function _emscripten_glDeleteVertexArrays(n, vaos) {
    for (var i = 0; i < n; i++) {
        var id = HEAP32[vaos + i * 4 >> 2];
        GLctx["deleteVertexArray"](GL.vaos[id]);
        GL.vaos[id] = null
    }
}

function _emscripten_glDepthFunc(x0) {
    GLctx["depthFunc"](x0)
}

function _emscripten_glDepthMask(flag) {
    GLctx.depthMask(!!flag)
}

function _emscripten_glDepthRange(x0, x1) {
    GLctx["depthRange"](x0, x1)
}

function _emscripten_glDepthRangef(x0, x1) {
    GLctx["depthRange"](x0, x1)
}

function _emscripten_glDetachShader(program, shader) {
    GLctx.detachShader(GL.programs[program], GL.shaders[shader])
}

function _emscripten_glDisable(x0) {
    GLctx["disable"](x0)
}

function _emscripten_glDisableVertexAttribArray(index) {
    var cb = GL.currentContext.clientBuffers[index];
    cb.enabled = false;
    GLctx.disableVertexAttribArray(index)
}

function _emscripten_glDrawArrays(mode, first, count) {
    GL.preDrawHandleClientVertexAttribBindings(first + count);
    GLctx.drawArrays(mode, first, count);
    GL.postDrawHandleClientVertexAttribBindings()
}

function _emscripten_glDrawArraysInstanced(mode, first, count, primcount) {
    GLctx["drawArraysInstanced"](mode, first, count, primcount)
}

function _emscripten_glDrawBuffers(n, bufs) {
    var bufArray = GL.tempFixedLengthArray[n];
    for (var i = 0; i < n; i++) {
        bufArray[i] = HEAP32[bufs + i * 4 >> 2]
    }
    GLctx["drawBuffers"](bufArray)
}

function _emscripten_glDrawElements(mode, count, type, indices) {
    var buf;
    if (!GL.currElementArrayBuffer) {
        var size = GL.calcBufLength(1, type, 0, count);
        buf = GL.getTempIndexBuffer(size);
        GLctx.bindBuffer(GLctx.ELEMENT_ARRAY_BUFFER, buf);
        GLctx.bufferSubData(GLctx.ELEMENT_ARRAY_BUFFER, 0, HEAPU8.subarray(indices, indices + size));
        indices = 0
    }
    GL.preDrawHandleClientVertexAttribBindings(count);
    GLctx.drawElements(mode, count, type, indices);
    GL.postDrawHandleClientVertexAttribBindings(count);
    if (!GL.currElementArrayBuffer) {
        GLctx.bindBuffer(GLctx.ELEMENT_ARRAY_BUFFER, null)
    }
}

function _emscripten_glDrawElementsInstanced(mode, count, type, indices, primcount) {
    GLctx["drawElementsInstanced"](mode, count, type, indices, primcount)
}

function _emscripten_glDrawRangeElements() {
    Module["printErr"]("missing function: emscripten_glDrawRangeElements");
    abort(-1)
}

function _emscripten_glEnable(x0) {
    GLctx["enable"](x0)
}

function _emscripten_glEnableClientState() {
    Module["printErr"]("missing function: emscripten_glEnableClientState");
    abort(-1)
}

function _emscripten_glEnableVertexAttribArray(index) {
    var cb = GL.currentContext.clientBuffers[index];
    cb.enabled = true;
    GLctx.enableVertexAttribArray(index)
}

function _emscripten_glFinish() {
    GLctx["finish"]()
}

function _emscripten_glFlush() {
    GLctx["flush"]()
}

function _emscripten_glFramebufferRenderbuffer(target, attachment, renderbuffertarget, renderbuffer) {
    GLctx.framebufferRenderbuffer(target, attachment, renderbuffertarget, GL.renderbuffers[renderbuffer])
}

function _emscripten_glFramebufferTexture2D(target, attachment, textarget, texture, level) {
    GLctx.framebufferTexture2D(target, attachment, textarget, GL.textures[texture], level)
}

function _emscripten_glFrontFace(x0) {
    GLctx["frontFace"](x0)
}

function _emscripten_glFrustum() {
    Module["printErr"]("missing function: emscripten_glFrustum");
    abort(-1)
}

function _emscripten_glGenBuffers(n, buffers) {
    for (var i = 0; i < n; i++) {
        var buffer = GLctx.createBuffer();
        if (!buffer) {
            GL.recordError(1282);
            while (i < n) HEAP32[buffers + i++ * 4 >> 2] = 0;
            return
        }
        var id = GL.getNewId(GL.buffers);
        buffer.name = id;
        GL.buffers[id] = buffer;
        HEAP32[buffers + i * 4 >> 2] = id
    }
}

function _emscripten_glGenFramebuffers(n, ids) {
    for (var i = 0; i < n; ++i) {
        var framebuffer = GLctx.createFramebuffer();
        if (!framebuffer) {
            GL.recordError(1282);
            while (i < n) HEAP32[ids + i++ * 4 >> 2] = 0;
            return
        }
        var id = GL.getNewId(GL.framebuffers);
        framebuffer.name = id;
        GL.framebuffers[id] = framebuffer;
        HEAP32[ids + i * 4 >> 2] = id
    }
}

function _emscripten_glGenRenderbuffers(n, renderbuffers) {
    for (var i = 0; i < n; i++) {
        var renderbuffer = GLctx.createRenderbuffer();
        if (!renderbuffer) {
            GL.recordError(1282);
            while (i < n) HEAP32[renderbuffers + i++ * 4 >> 2] = 0;
            return
        }
        var id = GL.getNewId(GL.renderbuffers);
        renderbuffer.name = id;
        GL.renderbuffers[id] = renderbuffer;
        HEAP32[renderbuffers + i * 4 >> 2] = id
    }
}

function _emscripten_glGenTextures(n, textures) {
    for (var i = 0; i < n; i++) {
        var texture = GLctx.createTexture();
        if (!texture) {
            GL.recordError(1282);
            while (i < n) HEAP32[textures + i++ * 4 >> 2] = 0;
            return
        }
        var id = GL.getNewId(GL.textures);
        texture.name = id;
        GL.textures[id] = texture;
        HEAP32[textures + i * 4 >> 2] = id
    }
}

function _emscripten_glGenVertexArrays(n, arrays) {
    for (var i = 0; i < n; i++) {
        var vao = GLctx["createVertexArray"]();
        if (!vao) {
            GL.recordError(1282);
            while (i < n) HEAP32[arrays + i++ * 4 >> 2] = 0;
            return
        }
        var id = GL.getNewId(GL.vaos);
        vao.name = id;
        GL.vaos[id] = vao;
        HEAP32[arrays + i * 4 >> 2] = id
    }
}

function _emscripten_glGenerateMipmap(x0) {
    GLctx["generateMipmap"](x0)
}

function _emscripten_glGetActiveAttrib(program, index, bufSize, length, size, type, name) {
    program = GL.programs[program];
    var info = GLctx.getActiveAttrib(program, index);
    if (!info) return;
    if (bufSize > 0 && name) {
        var numBytesWrittenExclNull = stringToUTF8(info.name, name, bufSize);
        if (length) HEAP32[length >> 2] = numBytesWrittenExclNull
    } else {
        if (length) HEAP32[length >> 2] = 0
    }
    if (size) HEAP32[size >> 2] = info.size;
    if (type) HEAP32[type >> 2] = info.type
}

function _emscripten_glGetActiveUniform(program, index, bufSize, length, size, type, name) {
    program = GL.programs[program];
    var info = GLctx.getActiveUniform(program, index);
    if (!info) return;
    if (bufSize > 0 && name) {
        var numBytesWrittenExclNull = stringToUTF8(info.name, name, bufSize);
        if (length) HEAP32[length >> 2] = numBytesWrittenExclNull
    } else {
        if (length) HEAP32[length >> 2] = 0
    }
    if (size) HEAP32[size >> 2] = info.size;
    if (type) HEAP32[type >> 2] = info.type
}

function _emscripten_glGetAttachedShaders(program, maxCount, count, shaders) {
    var result = GLctx.getAttachedShaders(GL.programs[program]);
    var len = result.length;
    if (len > maxCount) {
        len = maxCount
    }
    HEAP32[count >> 2] = len;
    for (var i = 0; i < len; ++i) {
        var id = GL.shaders.indexOf(result[i]);
        HEAP32[shaders + i * 4 >> 2] = id
    }
}

function _emscripten_glGetAttribLocation(program, name) {
    program = GL.programs[program];
    name = Pointer_stringify(name);
    return GLctx.getAttribLocation(program, name)
}

function _emscripten_glGetBooleanv(name_, p) {
    emscriptenWebGLGet(name_, p, "Boolean")
}

function _emscripten_glGetBufferParameteriv(target, value, data) {
    if (!data) {
        GL.recordError(1281);
        return
    }
    HEAP32[data >> 2] = GLctx.getBufferParameter(target, value)
}

function _emscripten_glGetError() {
    if (GL.lastError) {
        var error = GL.lastError;
        GL.lastError = 0;
        return error
    } else {
        return GLctx.getError()
    }
}

function _emscripten_glGetFloatv(name_, p) {
    emscriptenWebGLGet(name_, p, "Float")
}

function _emscripten_glGetFramebufferAttachmentParameteriv(target, attachment, pname, params) {
    var result = GLctx.getFramebufferAttachmentParameter(target, attachment, pname);
    HEAP32[params >> 2] = result
}

function _emscripten_glGetInfoLogARB() {
    Module["printErr"]("missing function: emscripten_glGetInfoLogARB");
    abort(-1)
}

function _emscripten_glGetIntegerv(name_, p) {
    emscriptenWebGLGet(name_, p, "Integer")
}

function _emscripten_glGetObjectParameterivARB() {
    Module["printErr"]("missing function: emscripten_glGetObjectParameterivARB");
    abort(-1)
}

function _emscripten_glGetPointerv() {
    Module["printErr"]("missing function: emscripten_glGetPointerv");
    abort(-1)
}

function _emscripten_glGetProgramInfoLog(program, maxLength, length, infoLog) {
    var log = GLctx.getProgramInfoLog(GL.programs[program]);
    if (log === null) log = "(unknown error)";
    if (maxLength > 0 && infoLog) {
        var numBytesWrittenExclNull = stringToUTF8(log, infoLog, maxLength);
        if (length) HEAP32[length >> 2] = numBytesWrittenExclNull
    } else {
        if (length) HEAP32[length >> 2] = 0
    }
}

function _emscripten_glGetProgramiv(program, pname, p) {
    if (!p) {
        GL.recordError(1281);
        return
    }
    if (program >= GL.counter) {
        GL.recordError(1281);
        return
    }
    var ptable = GL.programInfos[program];
    if (!ptable) {
        GL.recordError(1282);
        return
    }
    if (pname == 35716) {
        var log = GLctx.getProgramInfoLog(GL.programs[program]);
        if (log === null) log = "(unknown error)";
        HEAP32[p >> 2] = log.length + 1
    } else if (pname == 35719) {
        HEAP32[p >> 2] = ptable.maxUniformLength
    } else if (pname == 35722) {
        if (ptable.maxAttributeLength == -1) {
            program = GL.programs[program];
            var numAttribs = GLctx.getProgramParameter(program, GLctx.ACTIVE_ATTRIBUTES);
            ptable.maxAttributeLength = 0;
            for (var i = 0; i < numAttribs; ++i) {
                var activeAttrib = GLctx.getActiveAttrib(program, i);
                ptable.maxAttributeLength = Math.max(ptable.maxAttributeLength, activeAttrib.name.length + 1)
            }
        }
        HEAP32[p >> 2] = ptable.maxAttributeLength
    } else if (pname == 35381) {
        if (ptable.maxUniformBlockNameLength == -1) {
            program = GL.programs[program];
            var numBlocks = GLctx.getProgramParameter(program, GLctx.ACTIVE_UNIFORM_BLOCKS);
            ptable.maxUniformBlockNameLength = 0;
            for (var i = 0; i < numBlocks; ++i) {
                var activeBlockName = GLctx.getActiveUniformBlockName(program, i);
                ptable.maxUniformBlockNameLength = Math.max(ptable.maxUniformBlockNameLength, activeBlockName.length + 1)
            }
        }
        HEAP32[p >> 2] = ptable.maxUniformBlockNameLength
    } else {
        HEAP32[p >> 2] = GLctx.getProgramParameter(GL.programs[program], pname)
    }
}

function _emscripten_glGetRenderbufferParameteriv(target, pname, params) {
    if (!params) {
        GL.recordError(1281);
        return
    }
    HEAP32[params >> 2] = GLctx.getRenderbufferParameter(target, pname)
}

function _emscripten_glGetShaderInfoLog(shader, maxLength, length, infoLog) {
    var log = GLctx.getShaderInfoLog(GL.shaders[shader]);
    if (log === null) log = "(unknown error)";
    if (maxLength > 0 && infoLog) {
        var numBytesWrittenExclNull = stringToUTF8(log, infoLog, maxLength);
        if (length) HEAP32[length >> 2] = numBytesWrittenExclNull
    } else {
        if (length) HEAP32[length >> 2] = 0
    }
}

function _emscripten_glGetShaderPrecisionFormat(shaderType, precisionType, range, precision) {
    var result = GLctx.getShaderPrecisionFormat(shaderType, precisionType);
    HEAP32[range >> 2] = result.rangeMin;
    HEAP32[range + 4 >> 2] = result.rangeMax;
    HEAP32[precision >> 2] = result.precision
}

function _emscripten_glGetShaderSource(shader, bufSize, length, source) {
    var result = GLctx.getShaderSource(GL.shaders[shader]);
    if (!result) return;
    if (bufSize > 0 && source) {
        var numBytesWrittenExclNull = stringToUTF8(result, source, bufSize);
        if (length) HEAP32[length >> 2] = numBytesWrittenExclNull
    } else {
        if (length) HEAP32[length >> 2] = 0
    }
}

function _emscripten_glGetShaderiv(shader, pname, p) {
    if (!p) {
        GL.recordError(1281);
        return
    }
    if (pname == 35716) {
        var log = GLctx.getShaderInfoLog(GL.shaders[shader]);
        if (log === null) log = "(unknown error)";
        HEAP32[p >> 2] = log.length + 1
    } else if (pname == 35720) {
        var source = GLctx.getShaderSource(GL.shaders[shader]);
        var sourceLength = source === null || source.length == 0 ? 0 : source.length + 1;
        HEAP32[p >> 2] = sourceLength
    } else {
        HEAP32[p >> 2] = GLctx.getShaderParameter(GL.shaders[shader], pname)
    }
}

function _emscripten_glGetString(name_) {
    if (GL.stringCache[name_]) return GL.stringCache[name_];
    var ret;
    switch (name_) {
        case 7936:
        case 7937:
        case 37445:
        case 37446:
            ret = allocate(intArrayFromString(GLctx.getParameter(name_)), "i8", ALLOC_NORMAL);
            break;
        case 7938:
            var glVersion = GLctx.getParameter(GLctx.VERSION); {
                glVersion = "OpenGL ES 2.0 (" + glVersion + ")"
            }
            ret = allocate(intArrayFromString(glVersion), "i8", ALLOC_NORMAL);
            break;
        case 7939:
            var exts = GLctx.getSupportedExtensions();
            var gl_exts = [];
            for (var i = 0; i < exts.length; ++i) {
                gl_exts.push(exts[i]);
                gl_exts.push("GL_" + exts[i])
            }
            ret = allocate(intArrayFromString(gl_exts.join(" ")), "i8", ALLOC_NORMAL);
            break;
        case 35724:
            var glslVersion = GLctx.getParameter(GLctx.SHADING_LANGUAGE_VERSION);
            var ver_re = /^WebGL GLSL ES ([0-9]\.[0-9][0-9]?)(?:$| .*)/;
            var ver_num = glslVersion.match(ver_re);
            if (ver_num !== null) {
                if (ver_num[1].length == 3) ver_num[1] = ver_num[1] + "0";
                glslVersion = "OpenGL ES GLSL ES " + ver_num[1] + " (" + glslVersion + ")"
            }
            ret = allocate(intArrayFromString(glslVersion), "i8", ALLOC_NORMAL);
            break;
        default:
            GL.recordError(1280);
            return 0
    }
    GL.stringCache[name_] = ret;
    return ret
}

function _emscripten_glGetTexParameterfv(target, pname, params) {
    if (!params) {
        GL.recordError(1281);
        return
    }
    HEAPF32[params >> 2] = GLctx.getTexParameter(target, pname)
}

function _emscripten_glGetTexParameteriv(target, pname, params) {
    if (!params) {
        GL.recordError(1281);
        return
    }
    HEAP32[params >> 2] = GLctx.getTexParameter(target, pname)
}

function _emscripten_glGetUniformLocation(program, name) {
    name = Pointer_stringify(name);
    var arrayOffset = 0;
    if (name.indexOf("]", name.length - 1) !== -1) {
        var ls = name.lastIndexOf("[");
        var arrayIndex = name.slice(ls + 1, -1);
        if (arrayIndex.length > 0) {
            arrayOffset = parseInt(arrayIndex);
            if (arrayOffset < 0) {
                return -1
            }
        }
        name = name.slice(0, ls)
    }
    var ptable = GL.programInfos[program];
    if (!ptable) {
        return -1
    }
    var utable = ptable.uniforms;
    var uniformInfo = utable[name];
    if (uniformInfo && arrayOffset < uniformInfo[0]) {
        return uniformInfo[1] + arrayOffset
    } else {
        return -1
    }
}

function emscriptenWebGLGetUniform(program, location, params, type) {
    if (!params) {
        GL.recordError(1281);
        return
    }
    var data = GLctx.getUniform(GL.programs[program], GL.uniforms[location]);
    if (typeof data == "number" || typeof data == "boolean") {
        switch (type) {
            case "Integer":
                HEAP32[params >> 2] = data;
                break;
            case "Float":
                HEAPF32[params >> 2] = data;
                break;
            default:
                throw "internal emscriptenWebGLGetUniform() error, bad type: " + type
        }
    } else {
        for (var i = 0; i < data.length; i++) {
            switch (type) {
                case "Integer":
                    HEAP32[params + i * 4 >> 2] = data[i];
                    break;
                case "Float":
                    HEAPF32[params + i * 4 >> 2] = data[i];
                    break;
                default:
                    throw "internal emscriptenWebGLGetUniform() error, bad type: " + type
            }
        }
    }
}

function _emscripten_glGetUniformfv(program, location, params) {
    emscriptenWebGLGetUniform(program, location, params, "Float")
}

function _emscripten_glGetUniformiv(program, location, params) {
    emscriptenWebGLGetUniform(program, location, params, "Integer")
}

function _emscripten_glGetVertexAttribPointerv(index, pname, pointer) {
    if (!pointer) {
        GL.recordError(1281);
        return
    }
    if (GL.currentContext.clientBuffers[index].enabled) {
        Module.printErr("glGetVertexAttribPointer on client-side array: not supported, bad data returned")
    }
    HEAP32[pointer >> 2] = GLctx.getVertexAttribOffset(index, pname)
}

function emscriptenWebGLGetVertexAttrib(index, pname, params, type) {
    if (!params) {
        GL.recordError(1281);
        return
    }
    if (GL.currentContext.clientBuffers[index].enabled) {
        Module.printErr("glGetVertexAttrib*v on client-side array: not supported, bad data returned")
    }
    var data = GLctx.getVertexAttrib(index, pname);
    if (pname == 34975) {
        HEAP32[params >> 2] = data["name"]
    } else if (typeof data == "number" || typeof data == "boolean") {
        switch (type) {
            case "Integer":
                HEAP32[params >> 2] = data;
                break;
            case "Float":
                HEAPF32[params >> 2] = data;
                break;
            case "FloatToInteger":
                HEAP32[params >> 2] = Math.fround(data);
                break;
            default:
                throw "internal emscriptenWebGLGetVertexAttrib() error, bad type: " + type
        }
    } else {
        for (var i = 0; i < data.length; i++) {
            switch (type) {
                case "Integer":
                    HEAP32[params + i * 4 >> 2] = data[i];
                    break;
                case "Float":
                    HEAPF32[params + i * 4 >> 2] = data[i];
                    break;
                case "FloatToInteger":
                    HEAP32[params + i * 4 >> 2] = Math.fround(data[i]);
                    break;
                default:
                    throw "internal emscriptenWebGLGetVertexAttrib() error, bad type: " + type
            }
        }
    }
}

function _emscripten_glGetVertexAttribfv(index, pname, params) {
    emscriptenWebGLGetVertexAttrib(index, pname, params, "Float")
}

function _emscripten_glGetVertexAttribiv(index, pname, params) {
    emscriptenWebGLGetVertexAttrib(index, pname, params, "FloatToInteger")
}

function _emscripten_glHint(x0, x1) {
    GLctx["hint"](x0, x1)
}

function _emscripten_glIsBuffer(buffer) {
    var b = GL.buffers[buffer];
    if (!b) return 0;
    return GLctx.isBuffer(b)
}

function _emscripten_glIsEnabled(x0) {
    return GLctx["isEnabled"](x0)
}

function _emscripten_glIsFramebuffer(framebuffer) {
    var fb = GL.framebuffers[framebuffer];
    if (!fb) return 0;
    return GLctx.isFramebuffer(fb)
}

function _emscripten_glIsProgram(program) {
    program = GL.programs[program];
    if (!program) return 0;
    return GLctx.isProgram(program)
}

function _emscripten_glIsRenderbuffer(renderbuffer) {
    var rb = GL.renderbuffers[renderbuffer];
    if (!rb) return 0;
    return GLctx.isRenderbuffer(rb)
}

function _emscripten_glIsShader(shader) {
    var s = GL.shaders[shader];
    if (!s) return 0;
    return GLctx.isShader(s)
}

function _emscripten_glIsTexture(texture) {
    var texture = GL.textures[texture];
    if (!texture) return 0;
    return GLctx.isTexture(texture)
}

function _emscripten_glIsVertexArray(array) {
    var vao = GL.vaos[array];
    if (!vao) return 0;
    return GLctx["isVertexArray"](vao)
}

function _emscripten_glLineWidth(x0) {
    GLctx["lineWidth"](x0)
}

function _emscripten_glLinkProgram(program) {
    GLctx.linkProgram(GL.programs[program]);
    GL.programInfos[program] = null;
    GL.populateUniformTable(program)
}

function _emscripten_glLoadIdentity() {
    throw "Legacy GL function (glLoadIdentity) called. If you want legacy GL emulation, you need to compile with -s LEGACY_GL_EMULATION=1 to enable legacy GL emulation."
}

function _emscripten_glLoadMatrixf() {
    Module["printErr"]("missing function: emscripten_glLoadMatrixf");
    abort(-1)
}

function _emscripten_glMatrixMode() {
    throw "Legacy GL function (glMatrixMode) called. If you want legacy GL emulation, you need to compile with -s LEGACY_GL_EMULATION=1 to enable legacy GL emulation."
}

function _emscripten_glNormalPointer() {
    Module["printErr"]("missing function: emscripten_glNormalPointer");
    abort(-1)
}

function _emscripten_glPixelStorei(pname, param) {
    if (pname == 3333) {
        GL.packAlignment = param
    } else if (pname == 3317) {
        GL.unpackAlignment = param
    }
    GLctx.pixelStorei(pname, param)
}

function _emscripten_glPolygonOffset(x0, x1) {
    GLctx["polygonOffset"](x0, x1)
}

function emscriptenWebGLComputeImageSize(width, height, sizePerPixel, alignment) {
    function roundedToNextMultipleOf(x, y) {
        return Math.floor((x + y - 1) / y) * y
    }
    var plainRowSize = width * sizePerPixel;
    var alignedRowSize = roundedToNextMultipleOf(plainRowSize, alignment);
    return height <= 0 ? 0 : (height - 1) * alignedRowSize + plainRowSize
}

function emscriptenWebGLGetTexPixelData(type, format, width, height, pixels, internalFormat) {
    var sizePerPixel;
    var numChannels;
    switch (format) {
        case 6406:
        case 6409:
        case 6402:
            numChannels = 1;
            break;
        case 6410:
            numChannels = 2;
            break;
        case 6407:
        case 35904:
            numChannels = 3;
            break;
        case 6408:
        case 35906:
            numChannels = 4;
            break;
        default:
            GL.recordError(1280);
            return null
    }
    switch (type) {
        case 5121:
            sizePerPixel = numChannels * 1;
            break;
        case 5123:
        case 36193:
            sizePerPixel = numChannels * 2;
            break;
        case 5125:
        case 5126:
            sizePerPixel = numChannels * 4;
            break;
        case 34042:
            sizePerPixel = 4;
            break;
        case 33635:
        case 32819:
        case 32820:
            sizePerPixel = 2;
            break;
        default:
            GL.recordError(1280);
            return null
    }
    var bytes = emscriptenWebGLComputeImageSize(width, height, sizePerPixel, GL.unpackAlignment);
    switch (type) {
        case 5121:
            return HEAPU8.subarray(pixels, pixels + bytes);
        case 5126:
            return HEAPF32.subarray(pixels >> 2, pixels + bytes >> 2);
        case 5125:
        case 34042:
            return HEAPU32.subarray(pixels >> 2, pixels + bytes >> 2);
        case 5123:
        case 33635:
        case 32819:
        case 32820:
        case 36193:
            return HEAPU16.subarray(pixels >> 1, pixels + bytes >> 1);
        default:
            GL.recordError(1280);
            return null
    }
}

function _emscripten_glReadPixels(x, y, width, height, format, type, pixels) {
    var pixelData = emscriptenWebGLGetTexPixelData(type, format, width, height, pixels, format);
    if (!pixelData) {
        GL.recordError(1280);
        return
    }
    GLctx.readPixels(x, y, width, height, format, type, pixelData)
}

function _emscripten_glReleaseShaderCompiler() {}

function _emscripten_glRenderbufferStorage(x0, x1, x2, x3) {
    GLctx["renderbufferStorage"](x0, x1, x2, x3)
}

function _emscripten_glRotatef() {
    Module["printErr"]("missing function: emscripten_glRotatef");
    abort(-1)
}

function _emscripten_glSampleCoverage(value, invert) {
    GLctx.sampleCoverage(value, !!invert)
}

function _emscripten_glScissor(x0, x1, x2, x3) {
    GLctx["scissor"](x0, x1, x2, x3)
}

function _emscripten_glShaderBinary() {
    GL.recordError(1280)
}

function _emscripten_glShaderSource(shader, count, string, length) {
    var source = GL.getSource(shader, count, string, length);
    GLctx.shaderSource(GL.shaders[shader], source)
}

function _emscripten_glStencilFunc(x0, x1, x2) {
    GLctx["stencilFunc"](x0, x1, x2)
}

function _emscripten_glStencilFuncSeparate(x0, x1, x2, x3) {
    GLctx["stencilFuncSeparate"](x0, x1, x2, x3)
}

function _emscripten_glStencilMask(x0) {
    GLctx["stencilMask"](x0)
}

function _emscripten_glStencilMaskSeparate(x0, x1) {
    GLctx["stencilMaskSeparate"](x0, x1)
}

function _emscripten_glStencilOp(x0, x1, x2) {
    GLctx["stencilOp"](x0, x1, x2)
}

function _emscripten_glStencilOpSeparate(x0, x1, x2, x3) {
    GLctx["stencilOpSeparate"](x0, x1, x2, x3)
}

function _emscripten_glTexCoordPointer() {
    Module["printErr"]("missing function: emscripten_glTexCoordPointer");
    abort(-1)
}

function _emscripten_glTexImage2D(target, level, internalFormat, width, height, border, format, type, pixels) {
    var pixelData = null;
    if (pixels) pixelData = emscriptenWebGLGetTexPixelData(type, format, width, height, pixels, internalFormat);
    GLctx.texImage2D(target, level, internalFormat, width, height, border, format, type, pixelData)
}

function _emscripten_glTexParameterf(x0, x1, x2) {
    GLctx["texParameterf"](x0, x1, x2)
}

function _emscripten_glTexParameterfv(target, pname, params) {
    var param = HEAPF32[params >> 2];
    GLctx.texParameterf(target, pname, param)
}

function _emscripten_glTexParameteri(x0, x1, x2) {
    GLctx["texParameteri"](x0, x1, x2)
}

function _emscripten_glTexParameteriv(target, pname, params) {
    var param = HEAP32[params >> 2];
    GLctx.texParameteri(target, pname, param)
}

function _emscripten_glTexSubImage2D(target, level, xoffset, yoffset, width, height, format, type, pixels) {
    var pixelData = null;
    if (pixels) pixelData = emscriptenWebGLGetTexPixelData(type, format, width, height, pixels, 0);
    GLctx.texSubImage2D(target, level, xoffset, yoffset, width, height, format, type, pixelData)
}

function _emscripten_glUniform1f(location, v0) {
    GLctx.uniform1f(GL.uniforms[location], v0)
}

function _emscripten_glUniform1fv(location, count, value) {
    var view;
    if (count <= GL.MINI_TEMP_BUFFER_SIZE) {
        view = GL.miniTempBufferViews[count - 1];
        for (var i = 0; i < count; ++i) {
            view[i] = HEAPF32[value + 4 * i >> 2]
        }
    } else {
        view = HEAPF32.subarray(value >> 2, value + count * 4 >> 2)
    }
    GLctx.uniform1fv(GL.uniforms[location], view)
}

function _emscripten_glUniform1i(location, v0) {
    GLctx.uniform1i(GL.uniforms[location], v0)
}

function _emscripten_glUniform1iv(location, count, value) {
    GLctx.uniform1iv(GL.uniforms[location], HEAP32.subarray(value >> 2, value + count * 4 >> 2))
}

function _emscripten_glUniform2f(location, v0, v1) {
    GLctx.uniform2f(GL.uniforms[location], v0, v1)
}

function _emscripten_glUniform2fv(location, count, value) {
    var view;
    if (2 * count <= GL.MINI_TEMP_BUFFER_SIZE) {
        view = GL.miniTempBufferViews[2 * count - 1];
        for (var i = 0; i < 2 * count; i += 2) {
            view[i] = HEAPF32[value + 4 * i >> 2];
            view[i + 1] = HEAPF32[value + (4 * i + 4) >> 2]
        }
    } else {
        view = HEAPF32.subarray(value >> 2, value + count * 8 >> 2)
    }
    GLctx.uniform2fv(GL.uniforms[location], view)
}

function _emscripten_glUniform2i(location, v0, v1) {
    GLctx.uniform2i(GL.uniforms[location], v0, v1)
}

function _emscripten_glUniform2iv(location, count, value) {
    GLctx.uniform2iv(GL.uniforms[location], HEAP32.subarray(value >> 2, value + count * 8 >> 2))
}

function _emscripten_glUniform3f(location, v0, v1, v2) {
    GLctx.uniform3f(GL.uniforms[location], v0, v1, v2)
}

function _emscripten_glUniform3fv(location, count, value) {
    var view;
    if (3 * count <= GL.MINI_TEMP_BUFFER_SIZE) {
        view = GL.miniTempBufferViews[3 * count - 1];
        for (var i = 0; i < 3 * count; i += 3) {
            view[i] = HEAPF32[value + 4 * i >> 2];
            view[i + 1] = HEAPF32[value + (4 * i + 4) >> 2];
            view[i + 2] = HEAPF32[value + (4 * i + 8) >> 2]
        }
    } else {
        view = HEAPF32.subarray(value >> 2, value + count * 12 >> 2)
    }
    GLctx.uniform3fv(GL.uniforms[location], view)
}

function _emscripten_glUniform3i(location, v0, v1, v2) {
    GLctx.uniform3i(GL.uniforms[location], v0, v1, v2)
}

function _emscripten_glUniform3iv(location, count, value) {
    GLctx.uniform3iv(GL.uniforms[location], HEAP32.subarray(value >> 2, value + count * 12 >> 2))
}

function _emscripten_glUniform4f(location, v0, v1, v2, v3) {
    GLctx.uniform4f(GL.uniforms[location], v0, v1, v2, v3)
}

function _emscripten_glUniform4fv(location, count, value) {
    var view;
    if (4 * count <= GL.MINI_TEMP_BUFFER_SIZE) {
        view = GL.miniTempBufferViews[4 * count - 1];
        for (var i = 0; i < 4 * count; i += 4) {
            view[i] = HEAPF32[value + 4 * i >> 2];
            view[i + 1] = HEAPF32[value + (4 * i + 4) >> 2];
            view[i + 2] = HEAPF32[value + (4 * i + 8) >> 2];
            view[i + 3] = HEAPF32[value + (4 * i + 12) >> 2]
        }
    } else {
        view = HEAPF32.subarray(value >> 2, value + count * 16 >> 2)
    }
    GLctx.uniform4fv(GL.uniforms[location], view)
}

function _emscripten_glUniform4i(location, v0, v1, v2, v3) {
    GLctx.uniform4i(GL.uniforms[location], v0, v1, v2, v3)
}

function _emscripten_glUniform4iv(location, count, value) {
    GLctx.uniform4iv(GL.uniforms[location], HEAP32.subarray(value >> 2, value + count * 16 >> 2))
}

function _emscripten_glUniformMatrix2fv(location, count, transpose, value) {
    var view;
    if (4 * count <= GL.MINI_TEMP_BUFFER_SIZE) {
        view = GL.miniTempBufferViews[4 * count - 1];
        for (var i = 0; i < 4 * count; i += 4) {
            view[i] = HEAPF32[value + 4 * i >> 2];
            view[i + 1] = HEAPF32[value + (4 * i + 4) >> 2];
            view[i + 2] = HEAPF32[value + (4 * i + 8) >> 2];
            view[i + 3] = HEAPF32[value + (4 * i + 12) >> 2]
        }
    } else {
        view = HEAPF32.subarray(value >> 2, value + count * 16 >> 2)
    }
    GLctx.uniformMatrix2fv(GL.uniforms[location], !!transpose, view)
}

function _emscripten_glUniformMatrix3fv(location, count, transpose, value) {
    var view;
    if (9 * count <= GL.MINI_TEMP_BUFFER_SIZE) {
        view = GL.miniTempBufferViews[9 * count - 1];
        for (var i = 0; i < 9 * count; i += 9) {
            view[i] = HEAPF32[value + 4 * i >> 2];
            view[i + 1] = HEAPF32[value + (4 * i + 4) >> 2];
            view[i + 2] = HEAPF32[value + (4 * i + 8) >> 2];
            view[i + 3] = HEAPF32[value + (4 * i + 12) >> 2];
            view[i + 4] = HEAPF32[value + (4 * i + 16) >> 2];
            view[i + 5] = HEAPF32[value + (4 * i + 20) >> 2];
            view[i + 6] = HEAPF32[value + (4 * i + 24) >> 2];
            view[i + 7] = HEAPF32[value + (4 * i + 28) >> 2];
            view[i + 8] = HEAPF32[value + (4 * i + 32) >> 2]
        }
    } else {
        view = HEAPF32.subarray(value >> 2, value + count * 36 >> 2)
    }
    GLctx.uniformMatrix3fv(GL.uniforms[location], !!transpose, view)
}

function _emscripten_glUniformMatrix4fv(location, count, transpose, value) {
    var view;
    if (16 * count <= GL.MINI_TEMP_BUFFER_SIZE) {
        view = GL.miniTempBufferViews[16 * count - 1];
        for (var i = 0; i < 16 * count; i += 16) {
            view[i] = HEAPF32[value + 4 * i >> 2];
            view[i + 1] = HEAPF32[value + (4 * i + 4) >> 2];
            view[i + 2] = HEAPF32[value + (4 * i + 8) >> 2];
            view[i + 3] = HEAPF32[value + (4 * i + 12) >> 2];
            view[i + 4] = HEAPF32[value + (4 * i + 16) >> 2];
            view[i + 5] = HEAPF32[value + (4 * i + 20) >> 2];
            view[i + 6] = HEAPF32[value + (4 * i + 24) >> 2];
            view[i + 7] = HEAPF32[value + (4 * i + 28) >> 2];
            view[i + 8] = HEAPF32[value + (4 * i + 32) >> 2];
            view[i + 9] = HEAPF32[value + (4 * i + 36) >> 2];
            view[i + 10] = HEAPF32[value + (4 * i + 40) >> 2];
            view[i + 11] = HEAPF32[value + (4 * i + 44) >> 2];
            view[i + 12] = HEAPF32[value + (4 * i + 48) >> 2];
            view[i + 13] = HEAPF32[value + (4 * i + 52) >> 2];
            view[i + 14] = HEAPF32[value + (4 * i + 56) >> 2];
            view[i + 15] = HEAPF32[value + (4 * i + 60) >> 2]
        }
    } else {
        view = HEAPF32.subarray(value >> 2, value + count * 64 >> 2)
    }
    GLctx.uniformMatrix4fv(GL.uniforms[location], !!transpose, view)
}

function _emscripten_glUseProgram(program) {
    GLctx.useProgram(program ? GL.programs[program] : null)
}

function _emscripten_glValidateProgram(program) {
    GLctx.validateProgram(GL.programs[program])
}

function _emscripten_glVertexAttrib1f(x0, x1) {
    GLctx["vertexAttrib1f"](x0, x1)
}

function _emscripten_glVertexAttrib1fv(index, v) {
    GLctx.vertexAttrib1f(index, HEAPF32[v >> 2])
}

function _emscripten_glVertexAttrib2f(x0, x1, x2) {
    GLctx["vertexAttrib2f"](x0, x1, x2)
}

function _emscripten_glVertexAttrib2fv(index, v) {
    GLctx.vertexAttrib2f(index, HEAPF32[v >> 2], HEAPF32[v + 4 >> 2])
}

function _emscripten_glVertexAttrib3f(x0, x1, x2, x3) {
    GLctx["vertexAttrib3f"](x0, x1, x2, x3)
}

function _emscripten_glVertexAttrib3fv(index, v) {
    GLctx.vertexAttrib3f(index, HEAPF32[v >> 2], HEAPF32[v + 4 >> 2], HEAPF32[v + 8 >> 2])
}

function _emscripten_glVertexAttrib4f(x0, x1, x2, x3, x4) {
    GLctx["vertexAttrib4f"](x0, x1, x2, x3, x4)
}

function _emscripten_glVertexAttrib4fv(index, v) {
    GLctx.vertexAttrib4f(index, HEAPF32[v >> 2], HEAPF32[v + 4 >> 2], HEAPF32[v + 8 >> 2], HEAPF32[v + 12 >> 2])
}

function _emscripten_glVertexAttribDivisor(index, divisor) {
    GLctx["vertexAttribDivisor"](index, divisor)
}

function _emscripten_glVertexAttribPointer(index, size, type, normalized, stride, ptr) {
    var cb = GL.currentContext.clientBuffers[index];
    if (!GL.currArrayBuffer) {
        cb.size = size;
        cb.type = type;
        cb.normalized = normalized;
        cb.stride = stride;
        cb.ptr = ptr;
        cb.clientside = true;
        return
    }
    cb.clientside = false;
    GLctx.vertexAttribPointer(index, size, type, !!normalized, stride, ptr)
}

function _emscripten_glVertexPointer() {
    throw "Legacy GL function (glVertexPointer) called. If you want legacy GL emulation, you need to compile with -s LEGACY_GL_EMULATION=1 to enable legacy GL emulation."
}

function _emscripten_glViewport(x0, x1, x2, x3) {
    GLctx["viewport"](x0, x1, x2, x3)
}

function _emscripten_request_pointerlock(target, deferUntilInEventHandler) {
    if (!target) target = "#canvas";
    target = JSEvents.findEventTarget(target);
    if (!target) return -4;
    if (!target.requestPointerLock && !target.mozRequestPointerLock && !target.webkitRequestPointerLock && !target.msRequestPointerLock) {
        return -1
    }
    var canPerformRequests = JSEvents.canPerformEventHandlerRequests();
    if (!canPerformRequests) {
        if (deferUntilInEventHandler) {
            JSEvents.deferCall(JSEvents.requestPointerLock, 2, [target]);
            return 1
        } else {
            return -2
        }
    }
    return JSEvents.requestPointerLock(target)
}

function _emscripten_set_canvas_element_size(target, width, height) {
    if (target) target = JSEvents.findEventTarget(target);
    else target = Module["canvas"];
    if (!target) return -4;
    target.width = width;
    target.height = height;
    return 0
}

function _emscripten_set_element_css_size(target, width, height) {
    if (!target) {
        target = Module["canvas"]
    } else {
        target = JSEvents.findEventTarget(target)
    }
    if (!target) return -4;
    target.style.setProperty("width", width + "px");
    target.style.setProperty("height", height + "px");
    return 0
}

function _emscripten_set_fullscreenchange_callback(target, userData, useCapture, callbackfunc) {
    if (typeof JSEvents.fullscreenEnabled() === "undefined") return -1;
    if (!target) target = document;
    else {
        target = JSEvents.findEventTarget(target);
        if (!target) return -4
    }
    JSEvents.registerFullscreenChangeEventCallback(target, userData, useCapture, callbackfunc, 19, "fullscreenchange");
    JSEvents.registerFullscreenChangeEventCallback(target, userData, useCapture, callbackfunc, 19, "mozfullscreenchange");
    JSEvents.registerFullscreenChangeEventCallback(target, userData, useCapture, callbackfunc, 19, "webkitfullscreenchange");
    JSEvents.registerFullscreenChangeEventCallback(target, userData, useCapture, callbackfunc, 19, "msfullscreenchange");
    return 0
}

function _emscripten_set_gamepadconnected_callback(userData, useCapture, callbackfunc) {
    if (!navigator.getGamepads && !navigator.webkitGetGamepads) return -1;
    JSEvents.registerGamepadEventCallback(window, userData, useCapture, callbackfunc, 26, "gamepadconnected");
    return 0
}

function _emscripten_set_gamepaddisconnected_callback(userData, useCapture, callbackfunc) {
    if (!navigator.getGamepads && !navigator.webkitGetGamepads) return -1;
    JSEvents.registerGamepadEventCallback(window, userData, useCapture, callbackfunc, 27, "gamepaddisconnected");
    return 0
}

function _emscripten_set_keydown_callback(target, userData, useCapture, callbackfunc) {
    JSEvents.registerKeyEventCallback(target, userData, useCapture, callbackfunc, 2, "keydown");
    return 0
}

function _emscripten_set_keypress_callback(target, userData, useCapture, callbackfunc) {
    JSEvents.registerKeyEventCallback(target, userData, useCapture, callbackfunc, 1, "keypress");
    return 0
}

function _emscripten_set_keyup_callback(target, userData, useCapture, callbackfunc) {
    JSEvents.registerKeyEventCallback(target, userData, useCapture, callbackfunc, 3, "keyup");
    return 0
}

function _emscripten_set_mousedown_callback(target, userData, useCapture, callbackfunc) {
    JSEvents.registerMouseEventCallback(target, userData, useCapture, callbackfunc, 5, "mousedown");
    return 0
}

function _emscripten_set_mousemove_callback(target, userData, useCapture, callbackfunc) {
    JSEvents.registerMouseEventCallback(target, userData, useCapture, callbackfunc, 8, "mousemove");
    return 0
}

function _emscripten_set_mouseup_callback(target, userData, useCapture, callbackfunc) {
    JSEvents.registerMouseEventCallback(target, userData, useCapture, callbackfunc, 6, "mouseup");
    return 0
}

function _emscripten_set_wheel_callback(target, userData, useCapture, callbackfunc) {
    target = JSEvents.findEventTarget(target);
    if (typeof target.onwheel !== "undefined") {
        JSEvents.registerWheelEventCallback(target, userData, useCapture, callbackfunc, 9, "wheel");
        return 0
    } else if (typeof target.onmousewheel !== "undefined") {
        JSEvents.registerWheelEventCallback(target, userData, useCapture, callbackfunc, 9, "mousewheel");
        return 0
    } else {
        return -1
    }
}

function __exit(status) {
    Module["exit"](status)
}

function _exit(status) {
    __exit(status)
}
var _environ = STATICTOP;
STATICTOP += 16;

function ___buildEnvironment(env) {
    var MAX_ENV_VALUES = 64;
    var TOTAL_ENV_SIZE = 1024;
    var poolPtr;
    var envPtr;
    if (!___buildEnvironment.called) {
        ___buildEnvironment.called = true;
        ENV["USER"] = ENV["LOGNAME"] = "web_user";
        ENV["PATH"] = "/";
        ENV["PWD"] = "/";
        ENV["HOME"] = "/home/web_user";
        ENV["LANG"] = "C.UTF-8";
        ENV["_"] = Module["thisProgram"];
        poolPtr = staticAlloc(TOTAL_ENV_SIZE);
        envPtr = staticAlloc(MAX_ENV_VALUES * 4);
        HEAP32[envPtr >> 2] = poolPtr;
        HEAP32[_environ >> 2] = envPtr
    } else {
        envPtr = HEAP32[_environ >> 2];
        poolPtr = HEAP32[envPtr >> 2]
    }
    var strings = [];
    var totalSize = 0;
    for (var key in env) {
        if (typeof env[key] === "string") {
            var line = key + "=" + env[key];
            strings.push(line);
            totalSize += line.length
        }
    }
    if (totalSize > TOTAL_ENV_SIZE) {
        throw new Error("Environment size exceeded TOTAL_ENV_SIZE!")
    }
    var ptrSize = 4;
    for (var i = 0; i < strings.length; i++) {
        var line = strings[i];
        writeAsciiToMemory(line, poolPtr);
        HEAP32[envPtr + i * ptrSize >> 2] = poolPtr;
        poolPtr += line.length + 1
    }
    HEAP32[envPtr + strings.length * ptrSize >> 2] = 0
}
var ENV = {};

function _getenv(name) {
    if (name === 0) return 0;
    name = Pointer_stringify(name);
    if (!ENV.hasOwnProperty(name)) return 0;
    if (_getenv.ret) _free(_getenv.ret);
    _getenv.ret = allocateUTF8(ENV[name]);
    return _getenv.ret
}

function _glActiveTexture(x0) {
    GLctx["activeTexture"](x0)
}

function _glAttachShader(program, shader) {
    GLctx.attachShader(GL.programs[program], GL.shaders[shader])
}

function _glBindBuffer(target, buffer) {
    var bufferObj = buffer ? GL.buffers[buffer] : null;
    if (target == GLctx.ARRAY_BUFFER) {
        GL.currArrayBuffer = buffer
    } else if (target == GLctx.ELEMENT_ARRAY_BUFFER) {
        GL.currElementArrayBuffer = buffer
    }
    GLctx.bindBuffer(target, bufferObj)
}

function _glBindFramebuffer(target, framebuffer) {
    GLctx.bindFramebuffer(target, framebuffer ? GL.framebuffers[framebuffer] : null)
}

function _glBindRenderbuffer(target, renderbuffer) {
    GLctx.bindRenderbuffer(target, renderbuffer ? GL.renderbuffers[renderbuffer] : null)
}

function _glBlendEquation(x0) {
    GLctx["blendEquation"](x0)
}

function _glBlendFunc(x0, x1) {
    GLctx["blendFunc"](x0, x1)
}

function _glBufferData(target, size, data, usage) {
    if (!data) {
        GLctx.bufferData(target, size, usage)
    } else {
        GLctx.bufferData(target, HEAPU8.subarray(data, data + size), usage)
    }
}

function _glCheckFramebufferStatus(x0) {
    return GLctx["checkFramebufferStatus"](x0)
}

function _glClear(x0) {
    GLctx["clear"](x0)
}

function _glClearColor(x0, x1, x2, x3) {
    GLctx["clearColor"](x0, x1, x2, x3)
}

function _glCompileShader(shader) {
    GLctx.compileShader(GL.shaders[shader])
}

function _glCreateProgram() {
    var id = GL.getNewId(GL.programs);
    var program = GLctx.createProgram();
    program.name = id;
    GL.programs[id] = program;
    return id
}

function _glCreateShader(shaderType) {
    var id = GL.getNewId(GL.shaders);
    GL.shaders[id] = GLctx.createShader(shaderType);
    return id
}

function _glDeleteBuffers(n, buffers) {
    for (var i = 0; i < n; i++) {
        var id = HEAP32[buffers + i * 4 >> 2];
        var buffer = GL.buffers[id];
        if (!buffer) continue;
        GLctx.deleteBuffer(buffer);
        buffer.name = 0;
        GL.buffers[id] = null;
        if (id == GL.currArrayBuffer) GL.currArrayBuffer = 0;
        if (id == GL.currElementArrayBuffer) GL.currElementArrayBuffer = 0
    }
}

function _glDeleteFramebuffers(n, framebuffers) {
    for (var i = 0; i < n; ++i) {
        var id = HEAP32[framebuffers + i * 4 >> 2];
        var framebuffer = GL.framebuffers[id];
        if (!framebuffer) continue;
        GLctx.deleteFramebuffer(framebuffer);
        framebuffer.name = 0;
        GL.framebuffers[id] = null
    }
}

function _glDeleteProgram(id) {
    if (!id) return;
    var program = GL.programs[id];
    if (!program) {
        GL.recordError(1281);
        return
    }
    GLctx.deleteProgram(program);
    program.name = 0;
    GL.programs[id] = null;
    GL.programInfos[id] = null
}

function _glDeleteRenderbuffers(n, renderbuffers) {
    for (var i = 0; i < n; i++) {
        var id = HEAP32[renderbuffers + i * 4 >> 2];
        var renderbuffer = GL.renderbuffers[id];
        if (!renderbuffer) continue;
        GLctx.deleteRenderbuffer(renderbuffer);
        renderbuffer.name = 0;
        GL.renderbuffers[id] = null
    }
}

function _glDeleteShader(id) {
    if (!id) return;
    var shader = GL.shaders[id];
    if (!shader) {
        GL.recordError(1281);
        return
    }
    GLctx.deleteShader(shader);
    GL.shaders[id] = null
}

function _glDisable(x0) {
    GLctx["disable"](x0)
}

function _glDisableVertexAttribArray(index) {
    var cb = GL.currentContext.clientBuffers[index];
    cb.enabled = false;
    GLctx.disableVertexAttribArray(index)
}

function _glDrawArrays(mode, first, count) {
    GL.preDrawHandleClientVertexAttribBindings(first + count);
    GLctx.drawArrays(mode, first, count);
    GL.postDrawHandleClientVertexAttribBindings()
}

function _glEnable(x0) {
    GLctx["enable"](x0)
}

function _glEnableVertexAttribArray(index) {
    var cb = GL.currentContext.clientBuffers[index];
    cb.enabled = true;
    GLctx.enableVertexAttribArray(index)
}

function _glFinish() {
    GLctx["finish"]()
}

function _glFlush() {
    GLctx["flush"]()
}

function _glFramebufferRenderbuffer(target, attachment, renderbuffertarget, renderbuffer) {
    GLctx.framebufferRenderbuffer(target, attachment, renderbuffertarget, GL.renderbuffers[renderbuffer])
}

function _glFramebufferTexture2D(target, attachment, textarget, texture, level) {
    GLctx.framebufferTexture2D(target, attachment, textarget, GL.textures[texture], level)
}

function _glGenBuffers(n, buffers) {
    for (var i = 0; i < n; i++) {
        var buffer = GLctx.createBuffer();
        if (!buffer) {
            GL.recordError(1282);
            while (i < n) HEAP32[buffers + i++ * 4 >> 2] = 0;
            return
        }
        var id = GL.getNewId(GL.buffers);
        buffer.name = id;
        GL.buffers[id] = buffer;
        HEAP32[buffers + i * 4 >> 2] = id
    }
}

function _glGenFramebuffers(n, ids) {
    for (var i = 0; i < n; ++i) {
        var framebuffer = GLctx.createFramebuffer();
        if (!framebuffer) {
            GL.recordError(1282);
            while (i < n) HEAP32[ids + i++ * 4 >> 2] = 0;
            return
        }
        var id = GL.getNewId(GL.framebuffers);
        framebuffer.name = id;
        GL.framebuffers[id] = framebuffer;
        HEAP32[ids + i * 4 >> 2] = id
    }
}

function _glGenRenderbuffers(n, renderbuffers) {
    for (var i = 0; i < n; i++) {
        var renderbuffer = GLctx.createRenderbuffer();
        if (!renderbuffer) {
            GL.recordError(1282);
            while (i < n) HEAP32[renderbuffers + i++ * 4 >> 2] = 0;
            return
        }
        var id = GL.getNewId(GL.renderbuffers);
        renderbuffer.name = id;
        GL.renderbuffers[id] = renderbuffer;
        HEAP32[renderbuffers + i * 4 >> 2] = id
    }
}

function _glGenerateMipmap(x0) {
    GLctx["generateMipmap"](x0)
}

function _glGetAttribLocation(program, name) {
    program = GL.programs[program];
    name = Pointer_stringify(name);
    return GLctx.getAttribLocation(program, name)
}

function _glGetError() {
    if (GL.lastError) {
        var error = GL.lastError;
        GL.lastError = 0;
        return error
    } else {
        return GLctx.getError()
    }
}

function _glGetProgramInfoLog(program, maxLength, length, infoLog) {
    var log = GLctx.getProgramInfoLog(GL.programs[program]);
    if (log === null) log = "(unknown error)";
    if (maxLength > 0 && infoLog) {
        var numBytesWrittenExclNull = stringToUTF8(log, infoLog, maxLength);
        if (length) HEAP32[length >> 2] = numBytesWrittenExclNull
    } else {
        if (length) HEAP32[length >> 2] = 0
    }
}

function _glGetProgramiv(program, pname, p) {
    if (!p) {
        GL.recordError(1281);
        return
    }
    if (program >= GL.counter) {
        GL.recordError(1281);
        return
    }
    var ptable = GL.programInfos[program];
    if (!ptable) {
        GL.recordError(1282);
        return
    }
    if (pname == 35716) {
        var log = GLctx.getProgramInfoLog(GL.programs[program]);
        if (log === null) log = "(unknown error)";
        HEAP32[p >> 2] = log.length + 1
    } else if (pname == 35719) {
        HEAP32[p >> 2] = ptable.maxUniformLength
    } else if (pname == 35722) {
        if (ptable.maxAttributeLength == -1) {
            program = GL.programs[program];
            var numAttribs = GLctx.getProgramParameter(program, GLctx.ACTIVE_ATTRIBUTES);
            ptable.maxAttributeLength = 0;
            for (var i = 0; i < numAttribs; ++i) {
                var activeAttrib = GLctx.getActiveAttrib(program, i);
                ptable.maxAttributeLength = Math.max(ptable.maxAttributeLength, activeAttrib.name.length + 1)
            }
        }
        HEAP32[p >> 2] = ptable.maxAttributeLength
    } else if (pname == 35381) {
        if (ptable.maxUniformBlockNameLength == -1) {
            program = GL.programs[program];
            var numBlocks = GLctx.getProgramParameter(program, GLctx.ACTIVE_UNIFORM_BLOCKS);
            ptable.maxUniformBlockNameLength = 0;
            for (var i = 0; i < numBlocks; ++i) {
                var activeBlockName = GLctx.getActiveUniformBlockName(program, i);
                ptable.maxUniformBlockNameLength = Math.max(ptable.maxUniformBlockNameLength, activeBlockName.length + 1)
            }
        }
        HEAP32[p >> 2] = ptable.maxUniformBlockNameLength
    } else {
        HEAP32[p >> 2] = GLctx.getProgramParameter(GL.programs[program], pname)
    }
}

function _glGetShaderInfoLog(shader, maxLength, length, infoLog) {
    var log = GLctx.getShaderInfoLog(GL.shaders[shader]);
    if (log === null) log = "(unknown error)";
    if (maxLength > 0 && infoLog) {
        var numBytesWrittenExclNull = stringToUTF8(log, infoLog, maxLength);
        if (length) HEAP32[length >> 2] = numBytesWrittenExclNull
    } else {
        if (length) HEAP32[length >> 2] = 0
    }
}

function _glGetShaderiv(shader, pname, p) {
    if (!p) {
        GL.recordError(1281);
        return
    }
    if (pname == 35716) {
        var log = GLctx.getShaderInfoLog(GL.shaders[shader]);
        if (log === null) log = "(unknown error)";
        HEAP32[p >> 2] = log.length + 1
    } else if (pname == 35720) {
        var source = GLctx.getShaderSource(GL.shaders[shader]);
        var sourceLength = source === null || source.length == 0 ? 0 : source.length + 1;
        HEAP32[p >> 2] = sourceLength
    } else {
        HEAP32[p >> 2] = GLctx.getShaderParameter(GL.shaders[shader], pname)
    }
}

function _glGetString(name_) {
    if (GL.stringCache[name_]) return GL.stringCache[name_];
    var ret;
    switch (name_) {
        case 7936:
        case 7937:
        case 37445:
        case 37446:
            ret = allocate(intArrayFromString(GLctx.getParameter(name_)), "i8", ALLOC_NORMAL);
            break;
        case 7938:
            var glVersion = GLctx.getParameter(GLctx.VERSION); {
                glVersion = "OpenGL ES 2.0 (" + glVersion + ")"
            }
            ret = allocate(intArrayFromString(glVersion), "i8", ALLOC_NORMAL);
            break;
        case 7939:
            var exts = GLctx.getSupportedExtensions();
            var gl_exts = [];
            for (var i = 0; i < exts.length; ++i) {
                gl_exts.push(exts[i]);
                gl_exts.push("GL_" + exts[i])
            }
            ret = allocate(intArrayFromString(gl_exts.join(" ")), "i8", ALLOC_NORMAL);
            break;
        case 35724:
            var glslVersion = GLctx.getParameter(GLctx.SHADING_LANGUAGE_VERSION);
            var ver_re = /^WebGL GLSL ES ([0-9]\.[0-9][0-9]?)(?:$| .*)/;
            var ver_num = glslVersion.match(ver_re);
            if (ver_num !== null) {
                if (ver_num[1].length == 3) ver_num[1] = ver_num[1] + "0";
                glslVersion = "OpenGL ES GLSL ES " + ver_num[1] + " (" + glslVersion + ")"
            }
            ret = allocate(intArrayFromString(glslVersion), "i8", ALLOC_NORMAL);
            break;
        default:
            GL.recordError(1280);
            return 0
    }
    GL.stringCache[name_] = ret;
    return ret
}

function _glGetUniformLocation(program, name) {
    name = Pointer_stringify(name);
    var arrayOffset = 0;
    if (name.indexOf("]", name.length - 1) !== -1) {
        var ls = name.lastIndexOf("[");
        var arrayIndex = name.slice(ls + 1, -1);
        if (arrayIndex.length > 0) {
            arrayOffset = parseInt(arrayIndex);
            if (arrayOffset < 0) {
                return -1
            }
        }
        name = name.slice(0, ls)
    }
    var ptable = GL.programInfos[program];
    if (!ptable) {
        return -1
    }
    var utable = ptable.uniforms;
    var uniformInfo = utable[name];
    if (uniformInfo && arrayOffset < uniformInfo[0]) {
        return uniformInfo[1] + arrayOffset
    } else {
        return -1
    }
}

function _glIsProgram(program) {
    program = GL.programs[program];
    if (!program) return 0;
    return GLctx.isProgram(program)
}

function _glLinkProgram(program) {
    GLctx.linkProgram(GL.programs[program]);
    GL.programInfos[program] = null;
    GL.populateUniformTable(program)
}

function _glPixelStorei(pname, param) {
    if (pname == 3333) {
        GL.packAlignment = param
    } else if (pname == 3317) {
        GL.unpackAlignment = param
    }
    GLctx.pixelStorei(pname, param)
}

function _glReadPixels(x, y, width, height, format, type, pixels) {
    var pixelData = emscriptenWebGLGetTexPixelData(type, format, width, height, pixels, format);
    if (!pixelData) {
        GL.recordError(1280);
        return
    }
    GLctx.readPixels(x, y, width, height, format, type, pixelData)
}

function _glRenderbufferStorage(x0, x1, x2, x3) {
    GLctx["renderbufferStorage"](x0, x1, x2, x3)
}

function _glShaderSource(shader, count, string, length) {
    var source = GL.getSource(shader, count, string, length);
    GLctx.shaderSource(GL.shaders[shader], source)
}

function _glTexImage2D(target, level, internalFormat, width, height, border, format, type, pixels) {
    var pixelData = null;
    if (pixels) pixelData = emscriptenWebGLGetTexPixelData(type, format, width, height, pixels, internalFormat);
    GLctx.texImage2D(target, level, internalFormat, width, height, border, format, type, pixelData)
}

function _glTexSubImage2D(target, level, xoffset, yoffset, width, height, format, type, pixels) {
    var pixelData = null;
    if (pixels) pixelData = emscriptenWebGLGetTexPixelData(type, format, width, height, pixels, 0);
    GLctx.texSubImage2D(target, level, xoffset, yoffset, width, height, format, type, pixelData)
}

function _glUniform1f(location, v0) {
    GLctx.uniform1f(GL.uniforms[location], v0)
}

function _glUniform1fv(location, count, value) {
    var view;
    if (count <= GL.MINI_TEMP_BUFFER_SIZE) {
        view = GL.miniTempBufferViews[count - 1];
        for (var i = 0; i < count; ++i) {
            view[i] = HEAPF32[value + 4 * i >> 2]
        }
    } else {
        view = HEAPF32.subarray(value >> 2, value + count * 4 >> 2)
    }
    GLctx.uniform1fv(GL.uniforms[location], view)
}

function _glUniform1i(location, v0) {
    GLctx.uniform1i(GL.uniforms[location], v0)
}

function _glUniform2f(location, v0, v1) {
    GLctx.uniform2f(GL.uniforms[location], v0, v1)
}

function _glUniform2fv(location, count, value) {
    var view;
    if (2 * count <= GL.MINI_TEMP_BUFFER_SIZE) {
        view = GL.miniTempBufferViews[2 * count - 1];
        for (var i = 0; i < 2 * count; i += 2) {
            view[i] = HEAPF32[value + 4 * i >> 2];
            view[i + 1] = HEAPF32[value + (4 * i + 4) >> 2]
        }
    } else {
        view = HEAPF32.subarray(value >> 2, value + count * 8 >> 2)
    }
    GLctx.uniform2fv(GL.uniforms[location], view)
}

function _glUniform3f(location, v0, v1, v2) {
    GLctx.uniform3f(GL.uniforms[location], v0, v1, v2)
}

function _glUniform3fv(location, count, value) {
    var view;
    if (3 * count <= GL.MINI_TEMP_BUFFER_SIZE) {
        view = GL.miniTempBufferViews[3 * count - 1];
        for (var i = 0; i < 3 * count; i += 3) {
            view[i] = HEAPF32[value + 4 * i >> 2];
            view[i + 1] = HEAPF32[value + (4 * i + 4) >> 2];
            view[i + 2] = HEAPF32[value + (4 * i + 8) >> 2]
        }
    } else {
        view = HEAPF32.subarray(value >> 2, value + count * 12 >> 2)
    }
    GLctx.uniform3fv(GL.uniforms[location], view)
}

function _glUniform4f(location, v0, v1, v2, v3) {
    GLctx.uniform4f(GL.uniforms[location], v0, v1, v2, v3)
}

function _glUniform4fv(location, count, value) {
    var view;
    if (4 * count <= GL.MINI_TEMP_BUFFER_SIZE) {
        view = GL.miniTempBufferViews[4 * count - 1];
        for (var i = 0; i < 4 * count; i += 4) {
            view[i] = HEAPF32[value + 4 * i >> 2];
            view[i + 1] = HEAPF32[value + (4 * i + 4) >> 2];
            view[i + 2] = HEAPF32[value + (4 * i + 8) >> 2];
            view[i + 3] = HEAPF32[value + (4 * i + 12) >> 2]
        }
    } else {
        view = HEAPF32.subarray(value >> 2, value + count * 16 >> 2)
    }
    GLctx.uniform4fv(GL.uniforms[location], view)
}

function _glUniformMatrix4fv(location, count, transpose, value) {
    var view;
    if (16 * count <= GL.MINI_TEMP_BUFFER_SIZE) {
        view = GL.miniTempBufferViews[16 * count - 1];
        for (var i = 0; i < 16 * count; i += 16) {
            view[i] = HEAPF32[value + 4 * i >> 2];
            view[i + 1] = HEAPF32[value + (4 * i + 4) >> 2];
            view[i + 2] = HEAPF32[value + (4 * i + 8) >> 2];
            view[i + 3] = HEAPF32[value + (4 * i + 12) >> 2];
            view[i + 4] = HEAPF32[value + (4 * i + 16) >> 2];
            view[i + 5] = HEAPF32[value + (4 * i + 20) >> 2];
            view[i + 6] = HEAPF32[value + (4 * i + 24) >> 2];
            view[i + 7] = HEAPF32[value + (4 * i + 28) >> 2];
            view[i + 8] = HEAPF32[value + (4 * i + 32) >> 2];
            view[i + 9] = HEAPF32[value + (4 * i + 36) >> 2];
            view[i + 10] = HEAPF32[value + (4 * i + 40) >> 2];
            view[i + 11] = HEAPF32[value + (4 * i + 44) >> 2];
            view[i + 12] = HEAPF32[value + (4 * i + 48) >> 2];
            view[i + 13] = HEAPF32[value + (4 * i + 52) >> 2];
            view[i + 14] = HEAPF32[value + (4 * i + 56) >> 2];
            view[i + 15] = HEAPF32[value + (4 * i + 60) >> 2]
        }
    } else {
        view = HEAPF32.subarray(value >> 2, value + count * 64 >> 2)
    }
    GLctx.uniformMatrix4fv(GL.uniforms[location], !!transpose, view)
}

function _glUseProgram(program) {
    GLctx.useProgram(program ? GL.programs[program] : null)
}

function _glVertexAttribPointer(index, size, type, normalized, stride, ptr) {
    var cb = GL.currentContext.clientBuffers[index];
    if (!GL.currArrayBuffer) {
        cb.size = size;
        cb.type = type;
        cb.normalized = normalized;
        cb.stride = stride;
        cb.ptr = ptr;
        cb.clientside = true;
        return
    }
    cb.clientside = false;
    GLctx.vertexAttribPointer(index, size, type, !!normalized, stride, ptr)
}

function _glViewport(x0, x1, x2, x3) {
    GLctx["viewport"](x0, x1, x2, x3)
}

function _llvm_bswap_i64(l, h) {
    var retl = _llvm_bswap_i32(h) >>> 0;
    var reth = _llvm_bswap_i32(l) >>> 0;
    return (setTempRet0(reth), retl) | 0
}

function _llvm_exp2_f32(x) {
    return Math.pow(2, x)
}
var _llvm_pow_f32 = Math_pow;
var _llvm_pow_f64 = Math_pow;

function _llvm_trap() {
    abort("trap!")
}
var ___tm_current = STATICTOP;
STATICTOP += 48;
var ___tm_timezone = allocate(intArrayFromString("GMT"), "i8", ALLOC_STATIC);
var _tzname = STATICTOP;
STATICTOP += 16;
var _daylight = STATICTOP;
STATICTOP += 16;
var _timezone = STATICTOP;
STATICTOP += 16;

function _tzset() {
    if (_tzset.called) return;
    _tzset.called = true;
    HEAP32[_timezone >> 2] = -(new Date).getTimezoneOffset() * 60;
    var winter = new Date(2e3, 0, 1);
    var summer = new Date(2e3, 6, 1);
    HEAP32[_daylight >> 2] = Number(winter.getTimezoneOffset() != summer.getTimezoneOffset());

    function extractZone(date) {
        var match = date.toTimeString().match(/\(([A-Za-z ]+)\)$/);
        return match ? match[1] : "GMT"
    }
    var winterName = extractZone(winter);
    var summerName = extractZone(summer);
    var winterNamePtr = allocate(intArrayFromString(winterName), "i8", ALLOC_NORMAL);
    var summerNamePtr = allocate(intArrayFromString(summerName), "i8", ALLOC_NORMAL);
    if (summer.getTimezoneOffset() < winter.getTimezoneOffset()) {
        HEAP32[_tzname >> 2] = winterNamePtr;
        HEAP32[_tzname + 4 >> 2] = summerNamePtr
    } else {
        HEAP32[_tzname >> 2] = summerNamePtr;
        HEAP32[_tzname + 4 >> 2] = winterNamePtr
    }
}

function _localtime_r(time, tmPtr) {
    _tzset();
    var date = new Date(HEAP32[time >> 2] * 1e3);
    HEAP32[tmPtr >> 2] = date.getSeconds();
    HEAP32[tmPtr + 4 >> 2] = date.getMinutes();
    HEAP32[tmPtr + 8 >> 2] = date.getHours();
    HEAP32[tmPtr + 12 >> 2] = date.getDate();
    HEAP32[tmPtr + 16 >> 2] = date.getMonth();
    HEAP32[tmPtr + 20 >> 2] = date.getFullYear() - 1900;
    HEAP32[tmPtr + 24 >> 2] = date.getDay();
    var start = new Date(date.getFullYear(), 0, 1);
    var yday = (date.getTime() - start.getTime()) / (1e3 * 60 * 60 * 24) | 0;
    HEAP32[tmPtr + 28 >> 2] = yday;
    HEAP32[tmPtr + 36 >> 2] = -(date.getTimezoneOffset() * 60);
    var summerOffset = (new Date(2e3, 6, 1)).getTimezoneOffset();
    var winterOffset = start.getTimezoneOffset();
    var dst = (summerOffset != winterOffset && date.getTimezoneOffset() == Math.min(winterOffset, summerOffset)) | 0;
    HEAP32[tmPtr + 32 >> 2] = dst;
    var zonePtr = HEAP32[_tzname + (dst ? 4 : 0) >> 2];
    HEAP32[tmPtr + 40 >> 2] = zonePtr;
    return tmPtr
}

function _localtime(time) {
    return _localtime_r(time, ___tm_current)
}

function _longjmp(env, value) {
    Module["setThrew"](env, value || 1);
    throw "longjmp"
}

function _emscripten_memcpy_big(dest, src, num) {
    HEAPU8.set(HEAPU8.subarray(src, src + num), dest);
    return dest
}

function _nanosleep(rqtp, rmtp) {
    var seconds = HEAP32[rqtp >> 2];
    var nanoseconds = HEAP32[rqtp + 4 >> 2];
    if (rmtp !== 0) {
        HEAP32[rmtp >> 2] = 0;
        HEAP32[rmtp + 4 >> 2] = 0
    }
    return _usleep(seconds * 1e6 + nanoseconds / 1e3)
}
var PTHREAD_SPECIFIC = {};

function _pthread_getspecific(key) {
    return PTHREAD_SPECIFIC[key] || 0
}
var PTHREAD_SPECIFIC_NEXT_KEY = 1;

function _pthread_key_create(key, destructor) {
    if (key == 0) {
        return ERRNO_CODES.EINVAL
    }
    HEAP32[key >> 2] = PTHREAD_SPECIFIC_NEXT_KEY;
    PTHREAD_SPECIFIC[PTHREAD_SPECIFIC_NEXT_KEY] = 0;
    PTHREAD_SPECIFIC_NEXT_KEY++;
    return 0
}

function _pthread_once(ptr, func) {
    if (!_pthread_once.seen) _pthread_once.seen = {};
    if (ptr in _pthread_once.seen) return;
    Module["dynCall_v"](func);
    _pthread_once.seen[ptr] = 1
}

function _pthread_setspecific(key, value) {
    if (!(key in PTHREAD_SPECIFIC)) {
        return ERRNO_CODES.EINVAL
    }
    PTHREAD_SPECIFIC[key] = value;
    return 0
}

function _raise(sig) {
    ___setErrNo(ERRNO_CODES.ENOSYS);
    return -1
}

function _sigaction(signum, act, oldact) {
    return 0
}

function _sigaltstack() {
    Module["printErr"]("missing function: sigaltstack");
    abort(-1)
}

function _sigemptyset(set) {
    HEAP32[set >> 2] = 0;
    return 0
}

function _siglongjmp() {
    return _longjmp.apply(null, arguments)
}

function __isLeapYear(year) {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
}

function __arraySum(array, index) {
    var sum = 0;
    for (var i = 0; i <= index; sum += array[i++]);
    return sum
}
var __MONTH_DAYS_LEAP = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
var __MONTH_DAYS_REGULAR = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function __addDays(date, days) {
    var newDate = new Date(date.getTime());
    while (days > 0) {
        var leap = __isLeapYear(newDate.getFullYear());
        var currentMonth = newDate.getMonth();
        var daysInCurrentMonth = (leap ? __MONTH_DAYS_LEAP : __MONTH_DAYS_REGULAR)[currentMonth];
        if (days > daysInCurrentMonth - newDate.getDate()) {
            days -= daysInCurrentMonth - newDate.getDate() + 1;
            newDate.setDate(1);
            if (currentMonth < 11) {
                newDate.setMonth(currentMonth + 1)
            } else {
                newDate.setMonth(0);
                newDate.setFullYear(newDate.getFullYear() + 1)
            }
        } else {
            newDate.setDate(newDate.getDate() + days);
            return newDate
        }
    }
    return newDate
}

function _strftime(s, maxsize, format, tm) {
    var tm_zone = HEAP32[tm + 40 >> 2];
    var date = {
        tm_sec: HEAP32[tm >> 2],
        tm_min: HEAP32[tm + 4 >> 2],
        tm_hour: HEAP32[tm + 8 >> 2],
        tm_mday: HEAP32[tm + 12 >> 2],
        tm_mon: HEAP32[tm + 16 >> 2],
        tm_year: HEAP32[tm + 20 >> 2],
        tm_wday: HEAP32[tm + 24 >> 2],
        tm_yday: HEAP32[tm + 28 >> 2],
        tm_isdst: HEAP32[tm + 32 >> 2],
        tm_gmtoff: HEAP32[tm + 36 >> 2],
        tm_zone: tm_zone ? Pointer_stringify(tm_zone) : ""
    };
    var pattern = Pointer_stringify(format);
    var EXPANSION_RULES_1 = {
        "%c": "%a %b %d %H:%M:%S %Y",
        "%D": "%m/%d/%y",
        "%F": "%Y-%m-%d",
        "%h": "%b",
        "%r": "%I:%M:%S %p",
        "%R": "%H:%M",
        "%T": "%H:%M:%S",
        "%x": "%m/%d/%y",
        "%X": "%H:%M:%S"
    };
    for (var rule in EXPANSION_RULES_1) {
        pattern = pattern.replace(new RegExp(rule, "g"), EXPANSION_RULES_1[rule])
    }
    var WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

    function leadingSomething(value, digits, character) {
        var str = typeof value === "number" ? value.toString() : value || "";
        while (str.length < digits) {
            str = character[0] + str
        }
        return str
    }

    function leadingNulls(value, digits) {
        return leadingSomething(value, digits, "0")
    }

    function compareByDay(date1, date2) {
        function sgn(value) {
            return value < 0 ? -1 : value > 0 ? 1 : 0
        }
        var compare;
        if ((compare = sgn(date1.getFullYear() - date2.getFullYear())) === 0) {
            if ((compare = sgn(date1.getMonth() - date2.getMonth())) === 0) {
                compare = sgn(date1.getDate() - date2.getDate())
            }
        }
        return compare
    }

    function getFirstWeekStartDate(janFourth) {
        switch (janFourth.getDay()) {
            case 0:
                return new Date(janFourth.getFullYear() - 1, 11, 29);
            case 1:
                return janFourth;
            case 2:
                return new Date(janFourth.getFullYear(), 0, 3);
            case 3:
                return new Date(janFourth.getFullYear(), 0, 2);
            case 4:
                return new Date(janFourth.getFullYear(), 0, 1);
            case 5:
                return new Date(janFourth.getFullYear() - 1, 11, 31);
            case 6:
                return new Date(janFourth.getFullYear() - 1, 11, 30)
        }
    }

    function getWeekBasedYear(date) {
        var thisDate = __addDays(new Date(date.tm_year + 1900, 0, 1), date.tm_yday);
        var janFourthThisYear = new Date(thisDate.getFullYear(), 0, 4);
        var janFourthNextYear = new Date(thisDate.getFullYear() + 1, 0, 4);
        var firstWeekStartThisYear = getFirstWeekStartDate(janFourthThisYear);
        var firstWeekStartNextYear = getFirstWeekStartDate(janFourthNextYear);
        if (compareByDay(firstWeekStartThisYear, thisDate) <= 0) {
            if (compareByDay(firstWeekStartNextYear, thisDate) <= 0) {
                return thisDate.getFullYear() + 1
            } else {
                return thisDate.getFullYear()
            }
        } else {
            return thisDate.getFullYear() - 1
        }
    }
    var EXPANSION_RULES_2 = {
        "%a": (function(date) {
            return WEEKDAYS[date.tm_wday].substring(0, 3)
        }),
        "%A": (function(date) {
            return WEEKDAYS[date.tm_wday]
        }),
        "%b": (function(date) {
            return MONTHS[date.tm_mon].substring(0, 3)
        }),
        "%B": (function(date) {
            return MONTHS[date.tm_mon]
        }),
        "%C": (function(date) {
            var year = date.tm_year + 1900;
            return leadingNulls(year / 100 | 0, 2)
        }),
        "%d": (function(date) {
            return leadingNulls(date.tm_mday, 2)
        }),
        "%e": (function(date) {
            return leadingSomething(date.tm_mday, 2, " ")
        }),
        "%g": (function(date) {
            return getWeekBasedYear(date).toString().substring(2)
        }),
        "%G": (function(date) {
            return getWeekBasedYear(date)
        }),
        "%H": (function(date) {
            return leadingNulls(date.tm_hour, 2)
        }),
        "%I": (function(date) {
            var twelveHour = date.tm_hour;
            if (twelveHour == 0) twelveHour = 12;
            else if (twelveHour > 12) twelveHour -= 12;
            return leadingNulls(twelveHour, 2)
        }),
        "%j": (function(date) {
            return leadingNulls(date.tm_mday + __arraySum(__isLeapYear(date.tm_year + 1900) ? __MONTH_DAYS_LEAP : __MONTH_DAYS_REGULAR, date.tm_mon - 1), 3)
        }),
        "%m": (function(date) {
            return leadingNulls(date.tm_mon + 1, 2)
        }),
        "%M": (function(date) {
            return leadingNulls(date.tm_min, 2)
        }),
        "%n": (function() {
            return "\n"
        }),
        "%p": (function(date) {
            if (date.tm_hour >= 0 && date.tm_hour < 12) {
                return "AM"
            } else {
                return "PM"
            }
        }),
        "%S": (function(date) {
            return leadingNulls(date.tm_sec, 2)
        }),
        "%t": (function() {
            return "\t"
        }),
        "%u": (function(date) {
            var day = new Date(date.tm_year + 1900, date.tm_mon + 1, date.tm_mday, 0, 0, 0, 0);
            return day.getDay() || 7
        }),
        "%U": (function(date) {
            var janFirst = new Date(date.tm_year + 1900, 0, 1);
            var firstSunday = janFirst.getDay() === 0 ? janFirst : __addDays(janFirst, 7 - janFirst.getDay());
            var endDate = new Date(date.tm_year + 1900, date.tm_mon, date.tm_mday);
            if (compareByDay(firstSunday, endDate) < 0) {
                var februaryFirstUntilEndMonth = __arraySum(__isLeapYear(endDate.getFullYear()) ? __MONTH_DAYS_LEAP : __MONTH_DAYS_REGULAR, endDate.getMonth() - 1) - 31;
                var firstSundayUntilEndJanuary = 31 - firstSunday.getDate();
                var days = firstSundayUntilEndJanuary + februaryFirstUntilEndMonth + endDate.getDate();
                return leadingNulls(Math.ceil(days / 7), 2)
            }
            return compareByDay(firstSunday, janFirst) === 0 ? "01" : "00"
        }),
        "%V": (function(date) {
            var janFourthThisYear = new Date(date.tm_year + 1900, 0, 4);
            var janFourthNextYear = new Date(date.tm_year + 1901, 0, 4);
            var firstWeekStartThisYear = getFirstWeekStartDate(janFourthThisYear);
            var firstWeekStartNextYear = getFirstWeekStartDate(janFourthNextYear);
            var endDate = __addDays(new Date(date.tm_year + 1900, 0, 1), date.tm_yday);
            if (compareByDay(endDate, firstWeekStartThisYear) < 0) {
                return "53"
            }
            if (compareByDay(firstWeekStartNextYear, endDate) <= 0) {
                return "01"
            }
            var daysDifference;
            if (firstWeekStartThisYear.getFullYear() < date.tm_year + 1900) {
                daysDifference = date.tm_yday + 32 - firstWeekStartThisYear.getDate()
            } else {
                daysDifference = date.tm_yday + 1 - firstWeekStartThisYear.getDate()
            }
            return leadingNulls(Math.ceil(daysDifference / 7), 2)
        }),
        "%w": (function(date) {
            var day = new Date(date.tm_year + 1900, date.tm_mon + 1, date.tm_mday, 0, 0, 0, 0);
            return day.getDay()
        }),
        "%W": (function(date) {
            var janFirst = new Date(date.tm_year, 0, 1);
            var firstMonday = janFirst.getDay() === 1 ? janFirst : __addDays(janFirst, janFirst.getDay() === 0 ? 1 : 7 - janFirst.getDay() + 1);
            var endDate = new Date(date.tm_year + 1900, date.tm_mon, date.tm_mday);
            if (compareByDay(firstMonday, endDate) < 0) {
                var februaryFirstUntilEndMonth = __arraySum(__isLeapYear(endDate.getFullYear()) ? __MONTH_DAYS_LEAP : __MONTH_DAYS_REGULAR, endDate.getMonth() - 1) - 31;
                var firstMondayUntilEndJanuary = 31 - firstMonday.getDate();
                var days = firstMondayUntilEndJanuary + februaryFirstUntilEndMonth + endDate.getDate();
                return leadingNulls(Math.ceil(days / 7), 2)
            }
            return compareByDay(firstMonday, janFirst) === 0 ? "01" : "00"
        }),
        "%y": (function(date) {
            return (date.tm_year + 1900).toString().substring(2)
        }),
        "%Y": (function(date) {
            return date.tm_year + 1900
        }),
        "%z": (function(date) {
            var off = date.tm_gmtoff;
            var ahead = off >= 0;
            off = Math.abs(off) / 60;
            off = off / 60 * 100 + off % 60;
            return (ahead ? "+" : "-") + String("0000" + off).slice(-4)
        }),
        "%Z": (function(date) {
            return date.tm_zone
        }),
        "%%": (function() {
            return "%"
        })
    };
    for (var rule in EXPANSION_RULES_2) {
        if (pattern.indexOf(rule) >= 0) {
            pattern = pattern.replace(new RegExp(rule, "g"), EXPANSION_RULES_2[rule](date))
        }
    }
    var bytes = intArrayFromString(pattern, false);
    if (bytes.length > maxsize) {
        return 0
    }
    writeArrayToMemory(bytes, s);
    return bytes.length - 1
}

function _sysconf(name) {
    switch (name) {
        case 30:
            return PAGE_SIZE;
        case 85:
            var maxHeapSize = 2 * 1024 * 1024 * 1024 - 65536;
            maxHeapSize = HEAPU8.length;
            return maxHeapSize / PAGE_SIZE;
        case 132:
        case 133:
        case 12:
        case 137:
        case 138:
        case 15:
        case 235:
        case 16:
        case 17:
        case 18:
        case 19:
        case 20:
        case 149:
        case 13:
        case 10:
        case 236:
        case 153:
        case 9:
        case 21:
        case 22:
        case 159:
        case 154:
        case 14:
        case 77:
        case 78:
        case 139:
        case 80:
        case 81:
        case 82:
        case 68:
        case 67:
        case 164:
        case 11:
        case 29:
        case 47:
        case 48:
        case 95:
        case 52:
        case 51:
        case 46:
            return 200809;
        case 79:
            return 0;
        case 27:
        case 246:
        case 127:
        case 128:
        case 23:
        case 24:
        case 160:
        case 161:
        case 181:
        case 182:
        case 242:
        case 183:
        case 184:
        case 243:
        case 244:
        case 245:
        case 165:
        case 178:
        case 179:
        case 49:
        case 50:
        case 168:
        case 169:
        case 175:
        case 170:
        case 171:
        case 172:
        case 97:
        case 76:
        case 32:
        case 173:
        case 35:
            return -1;
        case 176:
        case 177:
        case 7:
        case 155:
        case 8:
        case 157:
        case 125:
        case 126:
        case 92:
        case 93:
        case 129:
        case 130:
        case 131:
        case 94:
        case 91:
            return 1;
        case 74:
        case 60:
        case 69:
        case 70:
        case 4:
            return 1024;
        case 31:
        case 42:
        case 72:
            return 32;
        case 87:
        case 26:
        case 33:
            return 2147483647;
        case 34:
        case 1:
            return 47839;
        case 38:
        case 36:
            return 99;
        case 43:
        case 37:
            return 2048;
        case 0:
            return 2097152;
        case 3:
            return 65536;
        case 28:
            return 32768;
        case 44:
            return 32767;
        case 75:
            return 16384;
        case 39:
            return 1e3;
        case 89:
            return 700;
        case 71:
            return 256;
        case 40:
            return 255;
        case 2:
            return 100;
        case 180:
            return 64;
        case 25:
            return 20;
        case 5:
            return 16;
        case 6:
            return 6;
        case 73:
            return 4;
        case 84:
            {
                if (typeof navigator === "object") return navigator["hardwareConcurrency"] || 1;
                return 1
            }
    }
    ___setErrNo(ERRNO_CODES.EINVAL);
    return -1
}

function _time(ptr) {
    var ret = Date.now() / 1e3 | 0;
    if (ptr) {
        HEAP32[ptr >> 2] = ret
    }
    return ret
}
var ___dso_handle = STATICTOP;
STATICTOP += 16;
Module["requestFullScreen"] = function Module_requestFullScreen(lockPointer, resizeCanvas, vrDevice) {
    Module.printErr("Module.requestFullScreen is deprecated. Please call Module.requestFullscreen instead.");
    Module["requestFullScreen"] = Module["requestFullscreen"];
    Browser.requestFullScreen(lockPointer, resizeCanvas, vrDevice)
};
Module["requestFullscreen"] = function Module_requestFullscreen(lockPointer, resizeCanvas, vrDevice) {
    Browser.requestFullscreen(lockPointer, resizeCanvas, vrDevice)
};
Module["requestAnimationFrame"] = function Module_requestAnimationFrame(func) {
    Browser.requestAnimationFrame(func)
};
Module["setCanvasSize"] = function Module_setCanvasSize(width, height, noUpdates) {
    Browser.setCanvasSize(width, height, noUpdates)
};
Module["pauseMainLoop"] = function Module_pauseMainLoop() {
    Browser.mainLoop.pause()
};
Module["resumeMainLoop"] = function Module_resumeMainLoop() {
    Browser.mainLoop.resume()
};
Module["getUserMedia"] = function Module_getUserMedia() {
    Browser.getUserMedia()
};
Module["createContext"] = function Module_createContext(canvas, useWebGL, setInModule, webGLContextAttributes) {
    return Browser.createContext(canvas, useWebGL, setInModule, webGLContextAttributes)
};
if (ENVIRONMENT_IS_NODE) {
    _emscripten_get_now = function _emscripten_get_now_actual() {
        var t = process["hrtime"]();
        return t[0] * 1e3 + t[1] / 1e6
    }
} else if (typeof dateNow !== "undefined") {
    _emscripten_get_now = dateNow
} else if (typeof self === "object" && self["performance"] && typeof self["performance"]["now"] === "function") {
    _emscripten_get_now = (function() {
        return self["performance"]["now"]()
    })
} else if (typeof performance === "object" && typeof performance["now"] === "function") {
    _emscripten_get_now = (function() {
        return performance["now"]()
    })
} else {
    _emscripten_get_now = Date.now
}
var GLctx;
GL.init();
FS.staticInit();
__ATINIT__.unshift((function() {
    if (!Module["noFSInit"] && !FS.init.initialized) FS.init()
}));
__ATMAIN__.push((function() {
    FS.ignorePermissions = false
}));
__ATEXIT__.push((function() {
    FS.quit()
}));
__ATINIT__.unshift((function() {
    TTY.init()
}));
__ATEXIT__.push((function() {
    TTY.shutdown()
}));
if (ENVIRONMENT_IS_NODE) {
    var fs = require("fs");
    var NODEJS_PATH = require("path");
    NODEFS.staticInit()
}
JSEvents.staticInit();
___buildEnvironment(ENV);
DYNAMICTOP_PTR = staticAlloc(4);
STACK_BASE = STACKTOP = alignMemory(STATICTOP);
STACK_MAX = STACK_BASE + TOTAL_STACK;
DYNAMIC_BASE = alignMemory(STACK_MAX);
HEAP32[DYNAMICTOP_PTR >> 2] = DYNAMIC_BASE;
staticSealed = true;
var ASSERTIONS = false;

function intArrayFromString(stringy, dontAddNull, length) {
    var len = length > 0 ? length : lengthBytesUTF8(stringy) + 1;
    var u8array = new Array(len);
    var numBytesWritten = stringToUTF8Array(stringy, u8array, 0, u8array.length);
    if (dontAddNull) u8array.length = numBytesWritten;
    return u8array
}
Module["wasmTableSize"] = 5237;
Module["wasmMaxTableSize"] = 5237;

function invoke_fffff(index, a1, a2, a3, a4) {
    try {
        return Module["dynCall_fffff"](index, a1, a2, a3, a4)
    } catch (e) {
        if (typeof e !== "number" && e !== "longjmp") throw e;
        Module["setThrew"](1, 0)
    }
}

function invoke_fi(index, a1) {
    try {
        return Module["dynCall_fi"](index, a1)
    } catch (e) {
        if (typeof e !== "number" && e !== "longjmp") throw e;
        Module["setThrew"](1, 0)
    }
}

function invoke_fii(index, a1, a2) {
    try {
        return Module["dynCall_fii"](index, a1, a2)
    } catch (e) {
        if (typeof e !== "number" && e !== "longjmp") throw e;
        Module["setThrew"](1, 0)
    }
}

function invoke_fiii(index, a1, a2, a3) {
    try {
        return Module["dynCall_fiii"](index, a1, a2, a3)
    } catch (e) {
        if (typeof e !== "number" && e !== "longjmp") throw e;
        Module["setThrew"](1, 0)
    }
}

function invoke_i(index) {
    try {
        return Module["dynCall_i"](index)
    } catch (e) {
        if (typeof e !== "number" && e !== "longjmp") throw e;
        Module["setThrew"](1, 0)
    }
}

function invoke_ii(index, a1) {
    try {
        return Module["dynCall_ii"](index, a1)
    } catch (e) {
        if (typeof e !== "number" && e !== "longjmp") throw e;
        Module["setThrew"](1, 0)
    }
}

function invoke_iidii(index, a1, a2, a3, a4) {
    try {
        return Module["dynCall_iidii"](index, a1, a2, a3, a4)
    } catch (e) {
        if (typeof e !== "number" && e !== "longjmp") throw e;
        Module["setThrew"](1, 0)
    }
}

function invoke_iif(index, a1, a2) {
    try {
        return Module["dynCall_iif"](index, a1, a2)
    } catch (e) {
        if (typeof e !== "number" && e !== "longjmp") throw e;
        Module["setThrew"](1, 0)
    }
}

function invoke_iii(index, a1, a2) {
    try {
        return Module["dynCall_iii"](index, a1, a2)
    } catch (e) {
        if (typeof e !== "number" && e !== "longjmp") throw e;
        Module["setThrew"](1, 0)
    }
}

function invoke_iiifi(index, a1, a2, a3, a4) {
    try {
        return Module["dynCall_iiifi"](index, a1, a2, a3, a4)
    } catch (e) {
        if (typeof e !== "number" && e !== "longjmp") throw e;
        Module["setThrew"](1, 0)
    }
}

function invoke_iiii(index, a1, a2, a3) {
    try {
        return Module["dynCall_iiii"](index, a1, a2, a3)
    } catch (e) {
        if (typeof e !== "number" && e !== "longjmp") throw e;
        Module["setThrew"](1, 0)
    }
}

function invoke_iiiif(index, a1, a2, a3, a4) {
    try {
        return Module["dynCall_iiiif"](index, a1, a2, a3, a4)
    } catch (e) {
        if (typeof e !== "number" && e !== "longjmp") throw e;
        Module["setThrew"](1, 0)
    }
}

function invoke_iiiifi(index, a1, a2, a3, a4, a5) {
    try {
        return Module["dynCall_iiiifi"](index, a1, a2, a3, a4, a5)
    } catch (e) {
        if (typeof e !== "number" && e !== "longjmp") throw e;
        Module["setThrew"](1, 0)
    }
}

function invoke_iiiii(index, a1, a2, a3, a4) {
    try {
        return Module["dynCall_iiiii"](index, a1, a2, a3, a4)
    } catch (e) {
        if (typeof e !== "number" && e !== "longjmp") throw e;
        Module["setThrew"](1, 0)
    }
}

function invoke_iiiiif(index, a1, a2, a3, a4, a5) {
    try {
        return Module["dynCall_iiiiif"](index, a1, a2, a3, a4, a5)
    } catch (e) {
        if (typeof e !== "number" && e !== "longjmp") throw e;
        Module["setThrew"](1, 0)
    }
}

function invoke_iiiiii(index, a1, a2, a3, a4, a5) {
    try {
        return Module["dynCall_iiiiii"](index, a1, a2, a3, a4, a5)
    } catch (e) {
        if (typeof e !== "number" && e !== "longjmp") throw e;
        Module["setThrew"](1, 0)
    }
}

function invoke_iiiiiii(index, a1, a2, a3, a4, a5, a6) {
    try {
        return Module["dynCall_iiiiiii"](index, a1, a2, a3, a4, a5, a6)
    } catch (e) {
        if (typeof e !== "number" && e !== "longjmp") throw e;
        Module["setThrew"](1, 0)
    }
}

function invoke_iiiiiiii(index, a1, a2, a3, a4, a5, a6, a7) {
    try {
        return Module["dynCall_iiiiiiii"](index, a1, a2, a3, a4, a5, a6, a7)
    } catch (e) {
        if (typeof e !== "number" && e !== "longjmp") throw e;
        Module["setThrew"](1, 0)
    }
}

function invoke_iiiiiiiii(index, a1, a2, a3, a4, a5, a6, a7, a8) {
    try {
        return Module["dynCall_iiiiiiiii"](index, a1, a2, a3, a4, a5, a6, a7, a8)
    } catch (e) {
        if (typeof e !== "number" && e !== "longjmp") throw e;
        Module["setThrew"](1, 0)
    }
}

function invoke_iiiiijiii(index, a1, a2, a3, a4, a5, a6, a7, a8, a9) {
    try {
        return Module["dynCall_iiiiijiii"](index, a1, a2, a3, a4, a5, a6, a7, a8, a9)
    } catch (e) {
        if (typeof e !== "number" && e !== "longjmp") throw e;
        Module["setThrew"](1, 0)
    }
}

function invoke_iijii(index, a1, a2, a3, a4, a5) {
    try {
        return Module["dynCall_iijii"](index, a1, a2, a3, a4, a5)
    } catch (e) {
        if (typeof e !== "number" && e !== "longjmp") throw e;
        Module["setThrew"](1, 0)
    }
}

function invoke_iijijii(index, a1, a2, a3, a4, a5, a6, a7, a8) {
    try {
        return Module["dynCall_iijijii"](index, a1, a2, a3, a4, a5, a6, a7, a8)
    } catch (e) {
        if (typeof e !== "number" && e !== "longjmp") throw e;
        Module["setThrew"](1, 0)
    }
}

function invoke_iji(index, a1, a2, a3) {
    try {
        return Module["dynCall_iji"](index, a1, a2, a3)
    } catch (e) {
        if (typeof e !== "number" && e !== "longjmp") throw e;
        Module["setThrew"](1, 0)
    }
}

function invoke_j(index) {
    try {
        return Module["dynCall_j"](index)
    } catch (e) {
        if (typeof e !== "number" && e !== "longjmp") throw e;
        Module["setThrew"](1, 0)
    }
}

function invoke_ji(index, a1) {
    try {
        return Module["dynCall_ji"](index, a1)
    } catch (e) {
        if (typeof e !== "number" && e !== "longjmp") throw e;
        Module["setThrew"](1, 0)
    }
}

function invoke_jiij(index, a1, a2, a3, a4) {
    try {
        return Module["dynCall_jiij"](index, a1, a2, a3, a4)
    } catch (e) {
        if (typeof e !== "number" && e !== "longjmp") throw e;
        Module["setThrew"](1, 0)
    }
}

function invoke_jiji(index, a1, a2, a3, a4) {
    try {
        return Module["dynCall_jiji"](index, a1, a2, a3, a4)
    } catch (e) {
        if (typeof e !== "number" && e !== "longjmp") throw e;
        Module["setThrew"](1, 0)
    }
}

function invoke_jijii(index, a1, a2, a3, a4, a5) {
    try {
        return Module["dynCall_jijii"](index, a1, a2, a3, a4, a5)
    } catch (e) {
        if (typeof e !== "number" && e !== "longjmp") throw e;
        Module["setThrew"](1, 0)
    }
}

function invoke_v(index) {
    try {
        Module["dynCall_v"](index)
    } catch (e) {
        if (typeof e !== "number" && e !== "longjmp") throw e;
        Module["setThrew"](1, 0)
    }
}

function invoke_vd(index, a1) {
    try {
        Module["dynCall_vd"](index, a1)
    } catch (e) {
        if (typeof e !== "number" && e !== "longjmp") throw e;
        Module["setThrew"](1, 0)
    }
}

function invoke_vdd(index, a1, a2) {
    try {
        Module["dynCall_vdd"](index, a1, a2)
    } catch (e) {
        if (typeof e !== "number" && e !== "longjmp") throw e;
        Module["setThrew"](1, 0)
    }
}

function invoke_vdddddd(index, a1, a2, a3, a4, a5, a6) {
    try {
        Module["dynCall_vdddddd"](index, a1, a2, a3, a4, a5, a6)
    } catch (e) {
        if (typeof e !== "number" && e !== "longjmp") throw e;
        Module["setThrew"](1, 0)
    }
}

function invoke_vf(index, a1) {
    try {
        Module["dynCall_vf"](index, a1)
    } catch (e) {
        if (typeof e !== "number" && e !== "longjmp") throw e;
        Module["setThrew"](1, 0)
    }
}

function invoke_vff(index, a1, a2) {
    try {
        Module["dynCall_vff"](index, a1, a2)
    } catch (e) {
        if (typeof e !== "number" && e !== "longjmp") throw e;
        Module["setThrew"](1, 0)
    }
}

function invoke_vffff(index, a1, a2, a3, a4) {
    try {
        Module["dynCall_vffff"](index, a1, a2, a3, a4)
    } catch (e) {
        if (typeof e !== "number" && e !== "longjmp") throw e;
        Module["setThrew"](1, 0)
    }
}

function invoke_vfi(index, a1, a2) {
    try {
        Module["dynCall_vfi"](index, a1, a2)
    } catch (e) {
        if (typeof e !== "number" && e !== "longjmp") throw e;
        Module["setThrew"](1, 0)
    }
}

function invoke_vi(index, a1) {
    try {
        Module["dynCall_vi"](index, a1)
    } catch (e) {
        if (typeof e !== "number" && e !== "longjmp") throw e;
        Module["setThrew"](1, 0)
    }
}

function invoke_vif(index, a1, a2) {
    try {
        Module["dynCall_vif"](index, a1, a2)
    } catch (e) {
        if (typeof e !== "number" && e !== "longjmp") throw e;
        Module["setThrew"](1, 0)
    }
}

function invoke_viff(index, a1, a2, a3) {
    try {
        Module["dynCall_viff"](index, a1, a2, a3)
    } catch (e) {
        if (typeof e !== "number" && e !== "longjmp") throw e;
        Module["setThrew"](1, 0)
    }
}

function invoke_vifff(index, a1, a2, a3, a4) {
    try {
        Module["dynCall_vifff"](index, a1, a2, a3, a4)
    } catch (e) {
        if (typeof e !== "number" && e !== "longjmp") throw e;
        Module["setThrew"](1, 0)
    }
}

function invoke_viffff(index, a1, a2, a3, a4, a5) {
    try {
        Module["dynCall_viffff"](index, a1, a2, a3, a4, a5)
    } catch (e) {
        if (typeof e !== "number" && e !== "longjmp") throw e;
        Module["setThrew"](1, 0)
    }
}

function invoke_vii(index, a1, a2) {
    try {
        Module["dynCall_vii"](index, a1, a2)
    } catch (e) {
        if (typeof e !== "number" && e !== "longjmp") throw e;
        Module["setThrew"](1, 0)
    }
}

function invoke_viif(index, a1, a2, a3) {
    try {
        Module["dynCall_viif"](index, a1, a2, a3)
    } catch (e) {
        if (typeof e !== "number" && e !== "longjmp") throw e;
        Module["setThrew"](1, 0)
    }
}

function invoke_viiffff(index, a1, a2, a3, a4, a5, a6) {
    try {
        Module["dynCall_viiffff"](index, a1, a2, a3, a4, a5, a6)
    } catch (e) {
        if (typeof e !== "number" && e !== "longjmp") throw e;
        Module["setThrew"](1, 0)
    }
}

function invoke_viii(index, a1, a2, a3) {
    try {
        Module["dynCall_viii"](index, a1, a2, a3)
    } catch (e) {
        if (typeof e !== "number" && e !== "longjmp") throw e;
        Module["setThrew"](1, 0)
    }
}

function invoke_viiii(index, a1, a2, a3, a4) {
    try {
        Module["dynCall_viiii"](index, a1, a2, a3, a4)
    } catch (e) {
        if (typeof e !== "number" && e !== "longjmp") throw e;
        Module["setThrew"](1, 0)
    }
}

function invoke_viiiii(index, a1, a2, a3, a4, a5) {
    try {
        Module["dynCall_viiiii"](index, a1, a2, a3, a4, a5)
    } catch (e) {
        if (typeof e !== "number" && e !== "longjmp") throw e;
        Module["setThrew"](1, 0)
    }
}

function invoke_viiiiif(index, a1, a2, a3, a4, a5, a6) {
    try {
        Module["dynCall_viiiiif"](index, a1, a2, a3, a4, a5, a6)
    } catch (e) {
        if (typeof e !== "number" && e !== "longjmp") throw e;
        Module["setThrew"](1, 0)
    }
}

function invoke_viiiiii(index, a1, a2, a3, a4, a5, a6) {
    try {
        Module["dynCall_viiiiii"](index, a1, a2, a3, a4, a5, a6)
    } catch (e) {
        if (typeof e !== "number" && e !== "longjmp") throw e;
        Module["setThrew"](1, 0)
    }
}

function invoke_viiiiiii(index, a1, a2, a3, a4, a5, a6, a7) {
    try {
        Module["dynCall_viiiiiii"](index, a1, a2, a3, a4, a5, a6, a7)
    } catch (e) {
        if (typeof e !== "number" && e !== "longjmp") throw e;
        Module["setThrew"](1, 0)
    }
}

function invoke_viiiiiiii(index, a1, a2, a3, a4, a5, a6, a7, a8) {
    try {
        Module["dynCall_viiiiiiii"](index, a1, a2, a3, a4, a5, a6, a7, a8)
    } catch (e) {
        if (typeof e !== "number" && e !== "longjmp") throw e;
        Module["setThrew"](1, 0)
    }
}

function invoke_viiiiiiiii(index, a1, a2, a3, a4, a5, a6, a7, a8, a9) {
    try {
        Module["dynCall_viiiiiiiii"](index, a1, a2, a3, a4, a5, a6, a7, a8, a9)
    } catch (e) {
        if (typeof e !== "number" && e !== "longjmp") throw e;
        Module["setThrew"](1, 0)
    }
}

function invoke_viiiiiiiiiii(index, a1, a2, a3, a4, a5, a6, a7, a8, a9, a10, a11) {
    try {
        Module["dynCall_viiiiiiiiiii"](index, a1, a2, a3, a4, a5, a6, a7, a8, a9, a10, a11)
    } catch (e) {
        if (typeof e !== "number" && e !== "longjmp") throw e;
        Module["setThrew"](1, 0)
    }
}

function invoke_viiijii(index, a1, a2, a3, a4, a5, a6, a7) {
    try {
        Module["dynCall_viiijii"](index, a1, a2, a3, a4, a5, a6, a7)
    } catch (e) {
        if (typeof e !== "number" && e !== "longjmp") throw e;
        Module["setThrew"](1, 0)
    }
}

function invoke_vj(index, a1, a2) {
    try {
        Module["dynCall_vj"](index, a1, a2)
    } catch (e) {
        if (typeof e !== "number" && e !== "longjmp") throw e;
        Module["setThrew"](1, 0)
    }
}
Module.asmGlobalArg = {};
Module.asmLibraryArg = {
    "abort": abort,
    "assert": assert,
    "enlargeMemory": enlargeMemory,
    "getTotalMemory": getTotalMemory,
    "abortOnCannotGrowMemory": abortOnCannotGrowMemory,
    "invoke_fffff": invoke_fffff,
    "invoke_fi": invoke_fi,
    "invoke_fii": invoke_fii,
    "invoke_fiii": invoke_fiii,
    "invoke_i": invoke_i,
    "invoke_ii": invoke_ii,
    "invoke_iidii": invoke_iidii,
    "invoke_iif": invoke_iif,
    "invoke_iii": invoke_iii,
    "invoke_iiifi": invoke_iiifi,
    "invoke_iiii": invoke_iiii,
    "invoke_iiiif": invoke_iiiif,
    "invoke_iiiifi": invoke_iiiifi,
    "invoke_iiiii": invoke_iiiii,
    "invoke_iiiiif": invoke_iiiiif,
    "invoke_iiiiii": invoke_iiiiii,
    "invoke_iiiiiii": invoke_iiiiiii,
    "invoke_iiiiiiii": invoke_iiiiiiii,
    "invoke_iiiiiiiii": invoke_iiiiiiiii,
    "invoke_iiiiijiii": invoke_iiiiijiii,
    "invoke_iijii": invoke_iijii,
    "invoke_iijijii": invoke_iijijii,
    "invoke_iji": invoke_iji,
    "invoke_j": invoke_j,
    "invoke_ji": invoke_ji,
    "invoke_jiij": invoke_jiij,
    "invoke_jiji": invoke_jiji,
    "invoke_jijii": invoke_jijii,
    "invoke_v": invoke_v,
    "invoke_vd": invoke_vd,
    "invoke_vdd": invoke_vdd,
    "invoke_vdddddd": invoke_vdddddd,
    "invoke_vf": invoke_vf,
    "invoke_vff": invoke_vff,
    "invoke_vffff": invoke_vffff,
    "invoke_vfi": invoke_vfi,
    "invoke_vi": invoke_vi,
    "invoke_vif": invoke_vif,
    "invoke_viff": invoke_viff,
    "invoke_vifff": invoke_vifff,
    "invoke_viffff": invoke_viffff,
    "invoke_vii": invoke_vii,
    "invoke_viif": invoke_viif,
    "invoke_viiffff": invoke_viiffff,
    "invoke_viii": invoke_viii,
    "invoke_viiii": invoke_viiii,
    "invoke_viiiii": invoke_viiiii,
    "invoke_viiiiif": invoke_viiiiif,
    "invoke_viiiiii": invoke_viiiiii,
    "invoke_viiiiiii": invoke_viiiiiii,
    "invoke_viiiiiiii": invoke_viiiiiiii,
    "invoke_viiiiiiiii": invoke_viiiiiiiii,
    "invoke_viiiiiiiiiii": invoke_viiiiiiiiiii,
    "invoke_viiijii": invoke_viiijii,
    "invoke_vj": invoke_vj,
    "_RWebAudioBufferSize": _RWebAudioBufferSize,
    "_RWebAudioFree": _RWebAudioFree,
    "_RWebAudioInit": _RWebAudioInit,
    "_RWebAudioRecalibrateTime": _RWebAudioRecalibrateTime,
    "_RWebAudioSampleRate": _RWebAudioSampleRate,
    "_RWebAudioSetNonblockState": _RWebAudioSetNonblockState,
    "_RWebAudioStart": _RWebAudioStart,
    "_RWebAudioStop": _RWebAudioStop,
    "_RWebAudioWrite": _RWebAudioWrite,
    "_RWebAudioWriteAvail": _RWebAudioWriteAvail,
    "_RWebCamFree": _RWebCamFree,
    "_RWebCamInit": _RWebCamInit,
    "_RWebCamPoll": _RWebCamPoll,
    "_RWebCamStart": _RWebCamStart,
    "_RWebCamStop": _RWebCamStop,
    "__ZSt18uncaught_exceptionv": __ZSt18uncaught_exceptionv,
    "___assert_fail": ___assert_fail,
    "___buildEnvironment": ___buildEnvironment,
    "___cxa_allocate_exception": ___cxa_allocate_exception,
    "___cxa_atexit": ___cxa_atexit,
    "___cxa_begin_catch": ___cxa_begin_catch,
    "___cxa_find_matching_catch": ___cxa_find_matching_catch,
    "___cxa_pure_virtual": ___cxa_pure_virtual,
    "___cxa_throw": ___cxa_throw,
    "___gxx_personality_v0": ___gxx_personality_v0,
    "___lock": ___lock,
    "___resumeException": ___resumeException,
    "___setErrNo": ___setErrNo,
    "___syscall10": ___syscall10,
    "___syscall140": ___syscall140,
    "___syscall145": ___syscall145,
    "___syscall146": ___syscall146,
    "___syscall195": ___syscall195,
    "___syscall197": ___syscall197,
    "___syscall20": ___syscall20,
    "___syscall220": ___syscall220,
    "___syscall221": ___syscall221,
    "___syscall3": ___syscall3,
    "___syscall39": ___syscall39,
    "___syscall4": ___syscall4,
    "___syscall40": ___syscall40,
    "___syscall5": ___syscall5,
    "___syscall54": ___syscall54,
    "___syscall6": ___syscall6,
    "___syscall85": ___syscall85,
    "___unlock": ___unlock,
    "__addDays": __addDays,
    "__arraySum": __arraySum,
    "__emscripten_sample_gamepad_data": __emscripten_sample_gamepad_data,
    "__exit": __exit,
    "__isLeapYear": __isLeapYear,
    "_abort": _abort,
    "_atexit": _atexit,
    "_clock_gettime": _clock_gettime,
    "_eglBindAPI": _eglBindAPI,
    "_eglChooseConfig": _eglChooseConfig,
    "_eglCreateContext": _eglCreateContext,
    "_eglCreateWindowSurface": _eglCreateWindowSurface,
    "_eglDestroyContext": _eglDestroyContext,
    "_eglDestroySurface": _eglDestroySurface,
    "_eglGetCurrentContext": _eglGetCurrentContext,
    "_eglGetDisplay": _eglGetDisplay,
    "_eglGetError": _eglGetError,
    "_eglGetProcAddress": _eglGetProcAddress,
    "_eglInitialize": _eglInitialize,
    "_eglMakeCurrent": _eglMakeCurrent,
    "_eglQuerySurface": _eglQuerySurface,
    "_eglSwapBuffers": _eglSwapBuffers,
    "_eglTerminate": _eglTerminate,
    "_eglWaitClient": _eglWaitClient,
    "_emscripten_asm_const_iii": _emscripten_asm_const_iii,
    "_emscripten_exit_pointerlock": _emscripten_exit_pointerlock,
    "_emscripten_force_exit": _emscripten_force_exit,
    "_emscripten_get_canvas_element_size": _emscripten_get_canvas_element_size,
    "_emscripten_get_fullscreen_status": _emscripten_get_fullscreen_status,
    "_emscripten_get_gamepad_status": _emscripten_get_gamepad_status,
    "_emscripten_get_now": _emscripten_get_now,
    "_emscripten_get_now_is_monotonic": _emscripten_get_now_is_monotonic,
    "_emscripten_get_num_gamepads": _emscripten_get_num_gamepads,
    "_emscripten_glActiveTexture": _emscripten_glActiveTexture,
    "_emscripten_glAttachShader": _emscripten_glAttachShader,
    "_emscripten_glBindAttribLocation": _emscripten_glBindAttribLocation,
    "_emscripten_glBindBuffer": _emscripten_glBindBuffer,
    "_emscripten_glBindFramebuffer": _emscripten_glBindFramebuffer,
    "_emscripten_glBindProgramARB": _emscripten_glBindProgramARB,
    "_emscripten_glBindRenderbuffer": _emscripten_glBindRenderbuffer,
    "_emscripten_glBindTexture": _emscripten_glBindTexture,
    "_emscripten_glBindVertexArray": _emscripten_glBindVertexArray,
    "_emscripten_glBlendColor": _emscripten_glBlendColor,
    "_emscripten_glBlendEquation": _emscripten_glBlendEquation,
    "_emscripten_glBlendEquationSeparate": _emscripten_glBlendEquationSeparate,
    "_emscripten_glBlendFunc": _emscripten_glBlendFunc,
    "_emscripten_glBlendFuncSeparate": _emscripten_glBlendFuncSeparate,
    "_emscripten_glBufferData": _emscripten_glBufferData,
    "_emscripten_glBufferSubData": _emscripten_glBufferSubData,
    "_emscripten_glCheckFramebufferStatus": _emscripten_glCheckFramebufferStatus,
    "_emscripten_glClear": _emscripten_glClear,
    "_emscripten_glClearColor": _emscripten_glClearColor,
    "_emscripten_glClearDepth": _emscripten_glClearDepth,
    "_emscripten_glClearDepthf": _emscripten_glClearDepthf,
    "_emscripten_glClearStencil": _emscripten_glClearStencil,
    "_emscripten_glClientActiveTexture": _emscripten_glClientActiveTexture,
    "_emscripten_glColorMask": _emscripten_glColorMask,
    "_emscripten_glColorPointer": _emscripten_glColorPointer,
    "_emscripten_glCompileShader": _emscripten_glCompileShader,
    "_emscripten_glCompressedTexImage2D": _emscripten_glCompressedTexImage2D,
    "_emscripten_glCompressedTexSubImage2D": _emscripten_glCompressedTexSubImage2D,
    "_emscripten_glCopyTexImage2D": _emscripten_glCopyTexImage2D,
    "_emscripten_glCopyTexSubImage2D": _emscripten_glCopyTexSubImage2D,
    "_emscripten_glCreateProgram": _emscripten_glCreateProgram,
    "_emscripten_glCreateShader": _emscripten_glCreateShader,
    "_emscripten_glCullFace": _emscripten_glCullFace,
    "_emscripten_glDeleteBuffers": _emscripten_glDeleteBuffers,
    "_emscripten_glDeleteFramebuffers": _emscripten_glDeleteFramebuffers,
    "_emscripten_glDeleteObjectARB": _emscripten_glDeleteObjectARB,
    "_emscripten_glDeleteProgram": _emscripten_glDeleteProgram,
    "_emscripten_glDeleteRenderbuffers": _emscripten_glDeleteRenderbuffers,
    "_emscripten_glDeleteShader": _emscripten_glDeleteShader,
    "_emscripten_glDeleteTextures": _emscripten_glDeleteTextures,
    "_emscripten_glDeleteVertexArrays": _emscripten_glDeleteVertexArrays,
    "_emscripten_glDepthFunc": _emscripten_glDepthFunc,
    "_emscripten_glDepthMask": _emscripten_glDepthMask,
    "_emscripten_glDepthRange": _emscripten_glDepthRange,
    "_emscripten_glDepthRangef": _emscripten_glDepthRangef,
    "_emscripten_glDetachShader": _emscripten_glDetachShader,
    "_emscripten_glDisable": _emscripten_glDisable,
    "_emscripten_glDisableVertexAttribArray": _emscripten_glDisableVertexAttribArray,
    "_emscripten_glDrawArrays": _emscripten_glDrawArrays,
    "_emscripten_glDrawArraysInstanced": _emscripten_glDrawArraysInstanced,
    "_emscripten_glDrawBuffers": _emscripten_glDrawBuffers,
    "_emscripten_glDrawElements": _emscripten_glDrawElements,
    "_emscripten_glDrawElementsInstanced": _emscripten_glDrawElementsInstanced,
    "_emscripten_glDrawRangeElements": _emscripten_glDrawRangeElements,
    "_emscripten_glEnable": _emscripten_glEnable,
    "_emscripten_glEnableClientState": _emscripten_glEnableClientState,
    "_emscripten_glEnableVertexAttribArray": _emscripten_glEnableVertexAttribArray,
    "_emscripten_glFinish": _emscripten_glFinish,
    "_emscripten_glFlush": _emscripten_glFlush,
    "_emscripten_glFramebufferRenderbuffer": _emscripten_glFramebufferRenderbuffer,
    "_emscripten_glFramebufferTexture2D": _emscripten_glFramebufferTexture2D,
    "_emscripten_glFrontFace": _emscripten_glFrontFace,
    "_emscripten_glFrustum": _emscripten_glFrustum,
    "_emscripten_glGenBuffers": _emscripten_glGenBuffers,
    "_emscripten_glGenFramebuffers": _emscripten_glGenFramebuffers,
    "_emscripten_glGenRenderbuffers": _emscripten_glGenRenderbuffers,
    "_emscripten_glGenTextures": _emscripten_glGenTextures,
    "_emscripten_glGenVertexArrays": _emscripten_glGenVertexArrays,
    "_emscripten_glGenerateMipmap": _emscripten_glGenerateMipmap,
    "_emscripten_glGetActiveAttrib": _emscripten_glGetActiveAttrib,
    "_emscripten_glGetActiveUniform": _emscripten_glGetActiveUniform,
    "_emscripten_glGetAttachedShaders": _emscripten_glGetAttachedShaders,
    "_emscripten_glGetAttribLocation": _emscripten_glGetAttribLocation,
    "_emscripten_glGetBooleanv": _emscripten_glGetBooleanv,
    "_emscripten_glGetBufferParameteriv": _emscripten_glGetBufferParameteriv,
    "_emscripten_glGetError": _emscripten_glGetError,
    "_emscripten_glGetFloatv": _emscripten_glGetFloatv,
    "_emscripten_glGetFramebufferAttachmentParameteriv": _emscripten_glGetFramebufferAttachmentParameteriv,
    "_emscripten_glGetInfoLogARB": _emscripten_glGetInfoLogARB,
    "_emscripten_glGetIntegerv": _emscripten_glGetIntegerv,
    "_emscripten_glGetObjectParameterivARB": _emscripten_glGetObjectParameterivARB,
    "_emscripten_glGetPointerv": _emscripten_glGetPointerv,
    "_emscripten_glGetProgramInfoLog": _emscripten_glGetProgramInfoLog,
    "_emscripten_glGetProgramiv": _emscripten_glGetProgramiv,
    "_emscripten_glGetRenderbufferParameteriv": _emscripten_glGetRenderbufferParameteriv,
    "_emscripten_glGetShaderInfoLog": _emscripten_glGetShaderInfoLog,
    "_emscripten_glGetShaderPrecisionFormat": _emscripten_glGetShaderPrecisionFormat,
    "_emscripten_glGetShaderSource": _emscripten_glGetShaderSource,
    "_emscripten_glGetShaderiv": _emscripten_glGetShaderiv,
    "_emscripten_glGetString": _emscripten_glGetString,
    "_emscripten_glGetTexParameterfv": _emscripten_glGetTexParameterfv,
    "_emscripten_glGetTexParameteriv": _emscripten_glGetTexParameteriv,
    "_emscripten_glGetUniformLocation": _emscripten_glGetUniformLocation,
    "_emscripten_glGetUniformfv": _emscripten_glGetUniformfv,
    "_emscripten_glGetUniformiv": _emscripten_glGetUniformiv,
    "_emscripten_glGetVertexAttribPointerv": _emscripten_glGetVertexAttribPointerv,
    "_emscripten_glGetVertexAttribfv": _emscripten_glGetVertexAttribfv,
    "_emscripten_glGetVertexAttribiv": _emscripten_glGetVertexAttribiv,
    "_emscripten_glHint": _emscripten_glHint,
    "_emscripten_glIsBuffer": _emscripten_glIsBuffer,
    "_emscripten_glIsEnabled": _emscripten_glIsEnabled,
    "_emscripten_glIsFramebuffer": _emscripten_glIsFramebuffer,
    "_emscripten_glIsProgram": _emscripten_glIsProgram,
    "_emscripten_glIsRenderbuffer": _emscripten_glIsRenderbuffer,
    "_emscripten_glIsShader": _emscripten_glIsShader,
    "_emscripten_glIsTexture": _emscripten_glIsTexture,
    "_emscripten_glIsVertexArray": _emscripten_glIsVertexArray,
    "_emscripten_glLineWidth": _emscripten_glLineWidth,
    "_emscripten_glLinkProgram": _emscripten_glLinkProgram,
    "_emscripten_glLoadIdentity": _emscripten_glLoadIdentity,
    "_emscripten_glLoadMatrixf": _emscripten_glLoadMatrixf,
    "_emscripten_glMatrixMode": _emscripten_glMatrixMode,
    "_emscripten_glNormalPointer": _emscripten_glNormalPointer,
    "_emscripten_glPixelStorei": _emscripten_glPixelStorei,
    "_emscripten_glPolygonOffset": _emscripten_glPolygonOffset,
    "_emscripten_glReadPixels": _emscripten_glReadPixels,
    "_emscripten_glReleaseShaderCompiler": _emscripten_glReleaseShaderCompiler,
    "_emscripten_glRenderbufferStorage": _emscripten_glRenderbufferStorage,
    "_emscripten_glRotatef": _emscripten_glRotatef,
    "_emscripten_glSampleCoverage": _emscripten_glSampleCoverage,
    "_emscripten_glScissor": _emscripten_glScissor,
    "_emscripten_glShaderBinary": _emscripten_glShaderBinary,
    "_emscripten_glShaderSource": _emscripten_glShaderSource,
    "_emscripten_glStencilFunc": _emscripten_glStencilFunc,
    "_emscripten_glStencilFuncSeparate": _emscripten_glStencilFuncSeparate,
    "_emscripten_glStencilMask": _emscripten_glStencilMask,
    "_emscripten_glStencilMaskSeparate": _emscripten_glStencilMaskSeparate,
    "_emscripten_glStencilOp": _emscripten_glStencilOp,
    "_emscripten_glStencilOpSeparate": _emscripten_glStencilOpSeparate,
    "_emscripten_glTexCoordPointer": _emscripten_glTexCoordPointer,
    "_emscripten_glTexImage2D": _emscripten_glTexImage2D,
    "_emscripten_glTexParameterf": _emscripten_glTexParameterf,
    "_emscripten_glTexParameterfv": _emscripten_glTexParameterfv,
    "_emscripten_glTexParameteri": _emscripten_glTexParameteri,
    "_emscripten_glTexParameteriv": _emscripten_glTexParameteriv,
    "_emscripten_glTexSubImage2D": _emscripten_glTexSubImage2D,
    "_emscripten_glUniform1f": _emscripten_glUniform1f,
    "_emscripten_glUniform1fv": _emscripten_glUniform1fv,
    "_emscripten_glUniform1i": _emscripten_glUniform1i,
    "_emscripten_glUniform1iv": _emscripten_glUniform1iv,
    "_emscripten_glUniform2f": _emscripten_glUniform2f,
    "_emscripten_glUniform2fv": _emscripten_glUniform2fv,
    "_emscripten_glUniform2i": _emscripten_glUniform2i,
    "_emscripten_glUniform2iv": _emscripten_glUniform2iv,
    "_emscripten_glUniform3f": _emscripten_glUniform3f,
    "_emscripten_glUniform3fv": _emscripten_glUniform3fv,
    "_emscripten_glUniform3i": _emscripten_glUniform3i,
    "_emscripten_glUniform3iv": _emscripten_glUniform3iv,
    "_emscripten_glUniform4f": _emscripten_glUniform4f,
    "_emscripten_glUniform4fv": _emscripten_glUniform4fv,
    "_emscripten_glUniform4i": _emscripten_glUniform4i,
    "_emscripten_glUniform4iv": _emscripten_glUniform4iv,
    "_emscripten_glUniformMatrix2fv": _emscripten_glUniformMatrix2fv,
    "_emscripten_glUniformMatrix3fv": _emscripten_glUniformMatrix3fv,
    "_emscripten_glUniformMatrix4fv": _emscripten_glUniformMatrix4fv,
    "_emscripten_glUseProgram": _emscripten_glUseProgram,
    "_emscripten_glValidateProgram": _emscripten_glValidateProgram,
    "_emscripten_glVertexAttrib1f": _emscripten_glVertexAttrib1f,
    "_emscripten_glVertexAttrib1fv": _emscripten_glVertexAttrib1fv,
    "_emscripten_glVertexAttrib2f": _emscripten_glVertexAttrib2f,
    "_emscripten_glVertexAttrib2fv": _emscripten_glVertexAttrib2fv,
    "_emscripten_glVertexAttrib3f": _emscripten_glVertexAttrib3f,
    "_emscripten_glVertexAttrib3fv": _emscripten_glVertexAttrib3fv,
    "_emscripten_glVertexAttrib4f": _emscripten_glVertexAttrib4f,
    "_emscripten_glVertexAttrib4fv": _emscripten_glVertexAttrib4fv,
    "_emscripten_glVertexAttribDivisor": _emscripten_glVertexAttribDivisor,
    "_emscripten_glVertexAttribPointer": _emscripten_glVertexAttribPointer,
    "_emscripten_glVertexPointer": _emscripten_glVertexPointer,
    "_emscripten_glViewport": _emscripten_glViewport,
    "_emscripten_memcpy_big": _emscripten_memcpy_big,
    "_emscripten_request_pointerlock": _emscripten_request_pointerlock,
    "_emscripten_set_canvas_element_size": _emscripten_set_canvas_element_size,
    "_emscripten_set_element_css_size": _emscripten_set_element_css_size,
    "_emscripten_set_fullscreenchange_callback": _emscripten_set_fullscreenchange_callback,
    "_emscripten_set_gamepadconnected_callback": _emscripten_set_gamepadconnected_callback,
    "_emscripten_set_gamepaddisconnected_callback": _emscripten_set_gamepaddisconnected_callback,
    "_emscripten_set_keydown_callback": _emscripten_set_keydown_callback,
    "_emscripten_set_keypress_callback": _emscripten_set_keypress_callback,
    "_emscripten_set_keyup_callback": _emscripten_set_keyup_callback,
    "_emscripten_set_main_loop": _emscripten_set_main_loop,
    "_emscripten_set_main_loop_timing": _emscripten_set_main_loop_timing,
    "_emscripten_set_mousedown_callback": _emscripten_set_mousedown_callback,
    "_emscripten_set_mousemove_callback": _emscripten_set_mousemove_callback,
    "_emscripten_set_mouseup_callback": _emscripten_set_mouseup_callback,
    "_emscripten_set_wheel_callback": _emscripten_set_wheel_callback,
    "_exit": _exit,
    "_getenv": _getenv,
    "_glActiveTexture": _glActiveTexture,
    "_glAttachShader": _glAttachShader,
    "_glBindBuffer": _glBindBuffer,
    "_glBindFramebuffer": _glBindFramebuffer,
    "_glBindRenderbuffer": _glBindRenderbuffer,
    "_glBindTexture": _glBindTexture,
    "_glBlendEquation": _glBlendEquation,
    "_glBlendFunc": _glBlendFunc,
    "_glBufferData": _glBufferData,
    "_glCheckFramebufferStatus": _glCheckFramebufferStatus,
    "_glClear": _glClear,
    "_glClearColor": _glClearColor,
    "_glCompileShader": _glCompileShader,
    "_glCreateProgram": _glCreateProgram,
    "_glCreateShader": _glCreateShader,
    "_glDeleteBuffers": _glDeleteBuffers,
    "_glDeleteFramebuffers": _glDeleteFramebuffers,
    "_glDeleteProgram": _glDeleteProgram,
    "_glDeleteRenderbuffers": _glDeleteRenderbuffers,
    "_glDeleteShader": _glDeleteShader,
    "_glDeleteTextures": _glDeleteTextures,
    "_glDisable": _glDisable,
    "_glDisableVertexAttribArray": _glDisableVertexAttribArray,
    "_glDrawArrays": _glDrawArrays,
    "_glEnable": _glEnable,
    "_glEnableVertexAttribArray": _glEnableVertexAttribArray,
    "_glFinish": _glFinish,
    "_glFlush": _glFlush,
    "_glFramebufferRenderbuffer": _glFramebufferRenderbuffer,
    "_glFramebufferTexture2D": _glFramebufferTexture2D,
    "_glGenBuffers": _glGenBuffers,
    "_glGenFramebuffers": _glGenFramebuffers,
    "_glGenRenderbuffers": _glGenRenderbuffers,
    "_glGenTextures": _glGenTextures,
    "_glGenerateMipmap": _glGenerateMipmap,
    "_glGetAttribLocation": _glGetAttribLocation,
    "_glGetError": _glGetError,
    "_glGetIntegerv": _glGetIntegerv,
    "_glGetProgramInfoLog": _glGetProgramInfoLog,
    "_glGetProgramiv": _glGetProgramiv,
    "_glGetShaderInfoLog": _glGetShaderInfoLog,
    "_glGetShaderiv": _glGetShaderiv,
    "_glGetString": _glGetString,
    "_glGetUniformLocation": _glGetUniformLocation,
    "_glIsProgram": _glIsProgram,
    "_glLinkProgram": _glLinkProgram,
    "_glPixelStorei": _glPixelStorei,
    "_glReadPixels": _glReadPixels,
    "_glRenderbufferStorage": _glRenderbufferStorage,
    "_glShaderSource": _glShaderSource,
    "_glTexImage2D": _glTexImage2D,
    "_glTexParameteri": _glTexParameteri,
    "_glTexSubImage2D": _glTexSubImage2D,
    "_glUniform1f": _glUniform1f,
    "_glUniform1fv": _glUniform1fv,
    "_glUniform1i": _glUniform1i,
    "_glUniform2f": _glUniform2f,
    "_glUniform2fv": _glUniform2fv,
    "_glUniform3f": _glUniform3f,
    "_glUniform3fv": _glUniform3fv,
    "_glUniform4f": _glUniform4f,
    "_glUniform4fv": _glUniform4fv,
    "_glUniformMatrix4fv": _glUniformMatrix4fv,
    "_glUseProgram": _glUseProgram,
    "_glVertexAttribPointer": _glVertexAttribPointer,
    "_glViewport": _glViewport,
    "_glutCreateWindow": _glutCreateWindow,
    "_glutDestroyWindow": _glutDestroyWindow,
    "_glutInitDisplayMode": _glutInitDisplayMode,
    "_llvm_bswap_i64": _llvm_bswap_i64,
    "_llvm_exp2_f32": _llvm_exp2_f32,
    "_llvm_pow_f32": _llvm_pow_f32,
    "_llvm_pow_f64": _llvm_pow_f64,
    "_llvm_trap": _llvm_trap,
    "_localtime": _localtime,
    "_localtime_r": _localtime_r,
    "_longjmp": _longjmp,
    "_nanosleep": _nanosleep,
    "_pthread_getspecific": _pthread_getspecific,
    "_pthread_key_create": _pthread_key_create,
    "_pthread_once": _pthread_once,
    "_pthread_setspecific": _pthread_setspecific,
    "_raise": _raise,
    "_sigaction": _sigaction,
    "_sigaltstack": _sigaltstack,
    "_sigemptyset": _sigemptyset,
    "_siglongjmp": _siglongjmp,
    "_strftime": _strftime,
    "_sysconf": _sysconf,
    "_time": _time,
    "_tzset": _tzset,
    "_usleep": _usleep,
    "emscriptenWebGLComputeImageSize": emscriptenWebGLComputeImageSize,
    "emscriptenWebGLGet": emscriptenWebGLGet,
    "emscriptenWebGLGetTexPixelData": emscriptenWebGLGetTexPixelData,
    "emscriptenWebGLGetUniform": emscriptenWebGLGetUniform,
    "emscriptenWebGLGetVertexAttrib": emscriptenWebGLGetVertexAttrib,
    "DYNAMICTOP_PTR": DYNAMICTOP_PTR,
    "tempDoublePtr": tempDoublePtr,
    "ABORT": ABORT,
    "STACKTOP": STACKTOP,
    "STACK_MAX": STACK_MAX,
    "___dso_handle": ___dso_handle
};
var asm = Module["asm"](Module.asmGlobalArg, Module.asmLibraryArg, buffer);
Module["asm"] = asm;
var __GLOBAL__sub_I_21fx_cpp = Module["__GLOBAL__sub_I_21fx_cpp"] = (function() {
    return Module["asm"]["__GLOBAL__sub_I_21fx_cpp"].apply(null, arguments)
});
var __GLOBAL__sub_I_bppu_cpp = Module["__GLOBAL__sub_I_bppu_cpp"] = (function() {
    return Module["asm"]["__GLOBAL__sub_I_bppu_cpp"].apply(null, arguments)
});
var __GLOBAL__sub_I_cartridge_cpp = Module["__GLOBAL__sub_I_cartridge_cpp"] = (function() {
    return Module["asm"]["__GLOBAL__sub_I_cartridge_cpp"].apply(null, arguments)
});
var __GLOBAL__sub_I_cheat_cpp = Module["__GLOBAL__sub_I_cheat_cpp"] = (function() {
    return Module["asm"]["__GLOBAL__sub_I_cheat_cpp"].apply(null, arguments)
});
var __GLOBAL__sub_I_interface_cpp = Module["__GLOBAL__sub_I_interface_cpp"] = (function() {
    return Module["asm"]["__GLOBAL__sub_I_interface_cpp"].apply(null, arguments)
});
var __GLOBAL__sub_I_libretro_cpp = Module["__GLOBAL__sub_I_libretro_cpp"] = (function() {
    return Module["asm"]["__GLOBAL__sub_I_libretro_cpp"].apply(null, arguments)
});
var __GLOBAL__sub_I_memory_cpp = Module["__GLOBAL__sub_I_memory_cpp"] = (function() {
    return Module["asm"]["__GLOBAL__sub_I_memory_cpp"].apply(null, arguments)
});
var __GLOBAL__sub_I_mempatcher_cpp = Module["__GLOBAL__sub_I_mempatcher_cpp"] = (function() {
    return Module["asm"]["__GLOBAL__sub_I_mempatcher_cpp"].apply(null, arguments)
});
var __GLOBAL__sub_I_sa1_cpp = Module["__GLOBAL__sub_I_sa1_cpp"] = (function() {
    return Module["asm"]["__GLOBAL__sub_I_sa1_cpp"].apply(null, arguments)
});
var __GLOBAL__sub_I_scpu_cpp = Module["__GLOBAL__sub_I_scpu_cpp"] = (function() {
    return Module["asm"]["__GLOBAL__sub_I_scpu_cpp"].apply(null, arguments)
});
var __GLOBAL__sub_I_sdsp_cpp = Module["__GLOBAL__sub_I_sdsp_cpp"] = (function() {
    return Module["asm"]["__GLOBAL__sub_I_sdsp_cpp"].apply(null, arguments)
});
var __GLOBAL__sub_I_spc7110_cpp = Module["__GLOBAL__sub_I_spc7110_cpp"] = (function() {
    return Module["asm"]["__GLOBAL__sub_I_spc7110_cpp"].apply(null, arguments)
});
var __GLOBAL__sub_I_ssmp_cpp = Module["__GLOBAL__sub_I_ssmp_cpp"] = (function() {
    return Module["asm"]["__GLOBAL__sub_I_ssmp_cpp"].apply(null, arguments)
});
var __GLOBAL__sub_I_superfx_cpp = Module["__GLOBAL__sub_I_superfx_cpp"] = (function() {
    return Module["asm"]["__GLOBAL__sub_I_superfx_cpp"].apply(null, arguments)
});
var __GLOBAL__sub_I_system_cpp = Module["__GLOBAL__sub_I_system_cpp"] = (function() {
    return Module["asm"]["__GLOBAL__sub_I_system_cpp"].apply(null, arguments)
});
var ___cxa_can_catch = Module["___cxa_can_catch"] = (function() {
    return Module["asm"]["___cxa_can_catch"].apply(null, arguments)
});
var ___cxa_is_pointer_type = Module["___cxa_is_pointer_type"] = (function() {
    return Module["asm"]["___cxa_is_pointer_type"].apply(null, arguments)
});
var ___errno_location = Module["___errno_location"] = (function() {
    return Module["asm"]["___errno_location"].apply(null, arguments)
});
var _cmd_load_state = Module["_cmd_load_state"] = (function() {
    return Module["asm"]["_cmd_load_state"].apply(null, arguments)
});
var _cmd_save_state = Module["_cmd_save_state"] = (function() {
    return Module["asm"]["_cmd_save_state"].apply(null, arguments)
});
var _cmd_savefiles = Module["_cmd_savefiles"] = (function() {
    return Module["asm"]["_cmd_savefiles"].apply(null, arguments)
});
var _cmd_take_screenshot = Module["_cmd_take_screenshot"] = (function() {
    return Module["asm"]["_cmd_take_screenshot"].apply(null, arguments)
});
var _emscripten_GetProcAddress = Module["_emscripten_GetProcAddress"] = (function() {
    return Module["asm"]["_emscripten_GetProcAddress"].apply(null, arguments)
});
var _fflush = Module["_fflush"] = (function() {
    return Module["asm"]["_fflush"].apply(null, arguments)
});
var _free = Module["_free"] = (function() {
    return Module["asm"]["_free"].apply(null, arguments)
});
var _llvm_bswap_i16 = Module["_llvm_bswap_i16"] = (function() {
    return Module["asm"]["_llvm_bswap_i16"].apply(null, arguments)
});
var _llvm_bswap_i32 = Module["_llvm_bswap_i32"] = (function() {
    return Module["asm"]["_llvm_bswap_i32"].apply(null, arguments)
});
var _main = Module["_main"] = (function() {
    return Module["asm"]["_main"].apply(null, arguments)
});
var _malloc = Module["_malloc"] = (function() {
    return Module["asm"]["_malloc"].apply(null, arguments)
});
var _memcpy = Module["_memcpy"] = (function() {
    return Module["asm"]["_memcpy"].apply(null, arguments)
});
var _memmove = Module["_memmove"] = (function() {
    return Module["asm"]["_memmove"].apply(null, arguments)
});
var _memset = Module["_memset"] = (function() {
    return Module["asm"]["_memset"].apply(null, arguments)
});
var _realloc = Module["_realloc"] = (function() {
    return Module["asm"]["_realloc"].apply(null, arguments)
});
var _roundf = Module["_roundf"] = (function() {
    return Module["asm"]["_roundf"].apply(null, arguments)
});
var _saveSetjmp = Module["_saveSetjmp"] = (function() {
    return Module["asm"]["_saveSetjmp"].apply(null, arguments)
});
var _sbrk = Module["_sbrk"] = (function() {
    return Module["asm"]["_sbrk"].apply(null, arguments)
});
var _strstr = Module["_strstr"] = (function() {
    return Module["asm"]["_strstr"].apply(null, arguments)
});
var _testSetjmp = Module["_testSetjmp"] = (function() {
    return Module["asm"]["_testSetjmp"].apply(null, arguments)
});
var establishStackSpace = Module["establishStackSpace"] = (function() {
    return Module["asm"]["establishStackSpace"].apply(null, arguments)
});
var getTempRet0 = Module["getTempRet0"] = (function() {
    return Module["asm"]["getTempRet0"].apply(null, arguments)
});
var runPostSets = Module["runPostSets"] = (function() {
    return Module["asm"]["runPostSets"].apply(null, arguments)
});
var setTempRet0 = Module["setTempRet0"] = (function() {
    return Module["asm"]["setTempRet0"].apply(null, arguments)
});
var setThrew = Module["setThrew"] = (function() {
    return Module["asm"]["setThrew"].apply(null, arguments)
});
var stackAlloc = Module["stackAlloc"] = (function() {
    return Module["asm"]["stackAlloc"].apply(null, arguments)
});
var stackRestore = Module["stackRestore"] = (function() {
    return Module["asm"]["stackRestore"].apply(null, arguments)
});
var stackSave = Module["stackSave"] = (function() {
    return Module["asm"]["stackSave"].apply(null, arguments)
});
var dynCall_fffff = Module["dynCall_fffff"] = (function() {
    return Module["asm"]["dynCall_fffff"].apply(null, arguments)
});
var dynCall_fi = Module["dynCall_fi"] = (function() {
    return Module["asm"]["dynCall_fi"].apply(null, arguments)
});
var dynCall_fii = Module["dynCall_fii"] = (function() {
    return Module["asm"]["dynCall_fii"].apply(null, arguments)
});
var dynCall_fiii = Module["dynCall_fiii"] = (function() {
    return Module["asm"]["dynCall_fiii"].apply(null, arguments)
});
var dynCall_i = Module["dynCall_i"] = (function() {
    return Module["asm"]["dynCall_i"].apply(null, arguments)
});
var dynCall_ii = Module["dynCall_ii"] = (function() {
    return Module["asm"]["dynCall_ii"].apply(null, arguments)
});
var dynCall_iidii = Module["dynCall_iidii"] = (function() {
    return Module["asm"]["dynCall_iidii"].apply(null, arguments)
});
var dynCall_iif = Module["dynCall_iif"] = (function() {
    return Module["asm"]["dynCall_iif"].apply(null, arguments)
});
var dynCall_iii = Module["dynCall_iii"] = (function() {
    return Module["asm"]["dynCall_iii"].apply(null, arguments)
});
var dynCall_iiifi = Module["dynCall_iiifi"] = (function() {
    return Module["asm"]["dynCall_iiifi"].apply(null, arguments)
});
var dynCall_iiii = Module["dynCall_iiii"] = (function() {
    return Module["asm"]["dynCall_iiii"].apply(null, arguments)
});
var dynCall_iiiif = Module["dynCall_iiiif"] = (function() {
    return Module["asm"]["dynCall_iiiif"].apply(null, arguments)
});
var dynCall_iiiifi = Module["dynCall_iiiifi"] = (function() {
    return Module["asm"]["dynCall_iiiifi"].apply(null, arguments)
});
var dynCall_iiiii = Module["dynCall_iiiii"] = (function() {
    return Module["asm"]["dynCall_iiiii"].apply(null, arguments)
});
var dynCall_iiiiif = Module["dynCall_iiiiif"] = (function() {
    return Module["asm"]["dynCall_iiiiif"].apply(null, arguments)
});
var dynCall_iiiiii = Module["dynCall_iiiiii"] = (function() {
    return Module["asm"]["dynCall_iiiiii"].apply(null, arguments)
});
var dynCall_iiiiiii = Module["dynCall_iiiiiii"] = (function() {
    return Module["asm"]["dynCall_iiiiiii"].apply(null, arguments)
});
var dynCall_iiiiiiii = Module["dynCall_iiiiiiii"] = (function() {
    return Module["asm"]["dynCall_iiiiiiii"].apply(null, arguments)
});
var dynCall_iiiiiiiii = Module["dynCall_iiiiiiiii"] = (function() {
    return Module["asm"]["dynCall_iiiiiiiii"].apply(null, arguments)
});
var dynCall_iiiiijiii = Module["dynCall_iiiiijiii"] = (function() {
    return Module["asm"]["dynCall_iiiiijiii"].apply(null, arguments)
});
var dynCall_iijii = Module["dynCall_iijii"] = (function() {
    return Module["asm"]["dynCall_iijii"].apply(null, arguments)
});
var dynCall_iijijii = Module["dynCall_iijijii"] = (function() {
    return Module["asm"]["dynCall_iijijii"].apply(null, arguments)
});
var dynCall_iji = Module["dynCall_iji"] = (function() {
    return Module["asm"]["dynCall_iji"].apply(null, arguments)
});
var dynCall_j = Module["dynCall_j"] = (function() {
    return Module["asm"]["dynCall_j"].apply(null, arguments)
});
var dynCall_ji = Module["dynCall_ji"] = (function() {
    return Module["asm"]["dynCall_ji"].apply(null, arguments)
});
var dynCall_jiij = Module["dynCall_jiij"] = (function() {
    return Module["asm"]["dynCall_jiij"].apply(null, arguments)
});
var dynCall_jiji = Module["dynCall_jiji"] = (function() {
    return Module["asm"]["dynCall_jiji"].apply(null, arguments)
});
var dynCall_jijii = Module["dynCall_jijii"] = (function() {
    return Module["asm"]["dynCall_jijii"].apply(null, arguments)
});
var dynCall_v = Module["dynCall_v"] = (function() {
    return Module["asm"]["dynCall_v"].apply(null, arguments)
});
var dynCall_vd = Module["dynCall_vd"] = (function() {
    return Module["asm"]["dynCall_vd"].apply(null, arguments)
});
var dynCall_vdd = Module["dynCall_vdd"] = (function() {
    return Module["asm"]["dynCall_vdd"].apply(null, arguments)
});
var dynCall_vdddddd = Module["dynCall_vdddddd"] = (function() {
    return Module["asm"]["dynCall_vdddddd"].apply(null, arguments)
});
var dynCall_vf = Module["dynCall_vf"] = (function() {
    return Module["asm"]["dynCall_vf"].apply(null, arguments)
});
var dynCall_vff = Module["dynCall_vff"] = (function() {
    return Module["asm"]["dynCall_vff"].apply(null, arguments)
});
var dynCall_vffff = Module["dynCall_vffff"] = (function() {
    return Module["asm"]["dynCall_vffff"].apply(null, arguments)
});
var dynCall_vfi = Module["dynCall_vfi"] = (function() {
    return Module["asm"]["dynCall_vfi"].apply(null, arguments)
});
var dynCall_vi = Module["dynCall_vi"] = (function() {
    return Module["asm"]["dynCall_vi"].apply(null, arguments)
});
var dynCall_vif = Module["dynCall_vif"] = (function() {
    return Module["asm"]["dynCall_vif"].apply(null, arguments)
});
var dynCall_viff = Module["dynCall_viff"] = (function() {
    return Module["asm"]["dynCall_viff"].apply(null, arguments)
});
var dynCall_vifff = Module["dynCall_vifff"] = (function() {
    return Module["asm"]["dynCall_vifff"].apply(null, arguments)
});
var dynCall_viffff = Module["dynCall_viffff"] = (function() {
    return Module["asm"]["dynCall_viffff"].apply(null, arguments)
});
var dynCall_vii = Module["dynCall_vii"] = (function() {
    return Module["asm"]["dynCall_vii"].apply(null, arguments)
});
var dynCall_viif = Module["dynCall_viif"] = (function() {
    return Module["asm"]["dynCall_viif"].apply(null, arguments)
});
var dynCall_viiffff = Module["dynCall_viiffff"] = (function() {
    return Module["asm"]["dynCall_viiffff"].apply(null, arguments)
});
var dynCall_viii = Module["dynCall_viii"] = (function() {
    return Module["asm"]["dynCall_viii"].apply(null, arguments)
});
var dynCall_viiii = Module["dynCall_viiii"] = (function() {
    return Module["asm"]["dynCall_viiii"].apply(null, arguments)
});
var dynCall_viiiii = Module["dynCall_viiiii"] = (function() {
    return Module["asm"]["dynCall_viiiii"].apply(null, arguments)
});
var dynCall_viiiiif = Module["dynCall_viiiiif"] = (function() {
    return Module["asm"]["dynCall_viiiiif"].apply(null, arguments)
});
var dynCall_viiiiii = Module["dynCall_viiiiii"] = (function() {
    return Module["asm"]["dynCall_viiiiii"].apply(null, arguments)
});
var dynCall_viiiiiii = Module["dynCall_viiiiiii"] = (function() {
    return Module["asm"]["dynCall_viiiiiii"].apply(null, arguments)
});
var dynCall_viiiiiiii = Module["dynCall_viiiiiiii"] = (function() {
    return Module["asm"]["dynCall_viiiiiiii"].apply(null, arguments)
});
var dynCall_viiiiiiiii = Module["dynCall_viiiiiiiii"] = (function() {
    return Module["asm"]["dynCall_viiiiiiiii"].apply(null, arguments)
});
var dynCall_viiiiiiiiiii = Module["dynCall_viiiiiiiiiii"] = (function() {
    return Module["asm"]["dynCall_viiiiiiiiiii"].apply(null, arguments)
});
var dynCall_viiijii = Module["dynCall_viiijii"] = (function() {
    return Module["asm"]["dynCall_viiijii"].apply(null, arguments)
});
var dynCall_vj = Module["dynCall_vj"] = (function() {
    return Module["asm"]["dynCall_vj"].apply(null, arguments)
});
Module["asm"] = asm;

function ExitStatus(status) {
    this.name = "ExitStatus";
    this.message = "Program terminated with exit(" + status + ")";
    this.status = status
}
ExitStatus.prototype = new Error;
ExitStatus.prototype.constructor = ExitStatus;
var initialStackTop;
var preloadStartTime = null;
var calledMain = false;
dependenciesFulfilled = function runCaller() {
    if (!Module["calledRun"]) run();
    if (!Module["calledRun"]) dependenciesFulfilled = runCaller
};
Module["callMain"] = function callMain(args) {
    args = args || [];
    ensureInitRuntime();
    var argc = args.length + 1;
    var argv = _malloc((argc + 1) * 4);
    HEAP32[argv >> 2] = allocateUTF8(Module["thisProgram"]);
    for (var i = 1; i < argc; i++) {
        HEAP32[(argv >> 2) + i] = allocateUTF8(args[i - 1])
    }
    HEAP32[(argv >> 2) + argc] = 0;
    try {
        var ret = Module["_main"](argc, argv, 0);
        exit(ret, true)
    } catch (e) {
        if (e instanceof ExitStatus) {
            return
        } else if (e == "SimulateInfiniteLoop") {
            Module["noExitRuntime"] = true;
            return
        } else {
            var toLog = e;
            if (e && typeof e === "object" && e.stack) {
                toLog = [e, e.stack]
            }
            Module.printErr("exception thrown: " + toLog);
            Module["quit"](1, e)
        }
    } finally {
        calledMain = true
    }
};

function run(args) {
    args = args || Module["arguments"];
    if (preloadStartTime === null) preloadStartTime = Date.now();
    if (runDependencies > 0) {
        return
    }
    preRun();
    if (runDependencies > 0) return;
    if (Module["calledRun"]) return;

    function doRun() {
        if (Module["calledRun"]) return;
        Module["calledRun"] = true;
        if (ABORT) return;
        ensureInitRuntime();
        preMain();
        if (Module["onRuntimeInitialized"]) Module["onRuntimeInitialized"]();
        if (Module["_main"] && shouldRunNow) Module["callMain"](args);
        postRun()
    }
    if (Module["setStatus"]) {
        Module["setStatus"]("Running...");
        setTimeout((function() {
            setTimeout((function() {
                Module["setStatus"]("")
            }), 1);
            doRun()
        }), 1)
    } else {
        doRun()
    }
}
Module["run"] = run;

function exit(status, implicit) {
    if (implicit && Module["noExitRuntime"] && status === 0) {
        return
    }
    if (Module["noExitRuntime"]) {} else {
        ABORT = true;
        EXITSTATUS = status;
        STACKTOP = initialStackTop;
        exitRuntime();
        if (Module["onExit"]) Module["onExit"](status)
    }
    if (ENVIRONMENT_IS_NODE) {
        process["exit"](status)
    }
    Module["quit"](status, new ExitStatus(status))
}
Module["exit"] = exit;
var abortDecorators = [];

function abort(what) {
    if (Module["onAbort"]) {
        Module["onAbort"](what)
    }
    if (what !== undefined) {
        Module.print(what);
        Module.printErr(what);
        what = JSON.stringify(what)
    } else {
        what = ""
    }
    ABORT = true;
    EXITSTATUS = 1;
    throw "abort(" + what + "). Build with -s ASSERTIONS=1 for more info."
}
Module["abort"] = abort;
if (Module["preInit"]) {
    if (typeof Module["preInit"] == "function") Module["preInit"] = [Module["preInit"]];
    while (Module["preInit"].length > 0) {
        Module["preInit"].pop()()
    }
}
var shouldRunNow = true;
if (Module["noInitialRun"]) {
    shouldRunNow = false
}
run()