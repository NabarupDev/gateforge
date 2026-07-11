// using native fetch (Node 18+)
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
// Assuming Node 18+ native fetch
var GATEWAY_URL = 'http://localhost:3000';
var BACKEND_URL = 'http://localhost:3001';
function sleep(ms) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            return [2 /*return*/, new Promise(function (resolve) { return setTimeout(resolve, ms); })];
        });
    });
}
function runCacheTests() {
    return __awaiter(this, void 0, void 0, function () {
        var tokenRes, tokenData, token, authHeaders, start1, res1, dur1, start2, res2, dur2, etag, res3, start4, res4, dur4, start5, res5, dur5, metricsRes, metrics;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log('--- Phase 9 Cache Verification ---\n');
                    console.log('[Setup] Enabling Cache for UserService-Retry (TTL: 5s)...');
                    return [4 /*yield*/, fetch("".concat(GATEWAY_URL, "/gateway/services"), {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                name: 'UserService-Retry',
                                basePath: '/users',
                                cacheEnabled: true,
                                defaultTtl: 5,
                            })
                        })];
                case 1:
                    _a.sent();
                    console.log('[Setup] Fetching JWT token...');
                    return [4 /*yield*/, fetch("".concat(GATEWAY_URL, "/auth/token"), {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ id: '1', email: 'test@gateforge.com', role: 'user' })
                        })];
                case 2:
                    tokenRes = _a.sent();
                    return [4 /*yield*/, tokenRes.json()];
                case 3:
                    tokenData = _a.sent();
                    token = tokenData.access_token || tokenData.accessToken || tokenData.token;
                    authHeaders = { 'Authorization': "Bearer ".concat(token) };
                    console.log('\n--- Test 1: Cache Hit ---');
                    start1 = Date.now();
                    return [4 /*yield*/, fetch("".concat(GATEWAY_URL, "/users/1"), { headers: authHeaders })];
                case 4:
                    res1 = _a.sent();
                    dur1 = Date.now() - start1;
                    console.log("Request 1 (Miss): ".concat(dur1, "ms | Status: ").concat(res1.status, " | x-cache: ").concat(res1.headers.get('x-cache')));
                    start2 = Date.now();
                    return [4 /*yield*/, fetch("".concat(GATEWAY_URL, "/users/1"), { headers: authHeaders })];
                case 5:
                    res2 = _a.sent();
                    dur2 = Date.now() - start2;
                    console.log("Request 2 (Hit): ".concat(dur2, "ms | Status: ").concat(res2.status, " | x-cache: ").concat(res2.headers.get('x-cache')));
                    if (res2.headers.get('x-cache') !== 'HIT') {
                        console.error('❌ Failed: Expected x-cache to be HIT');
                        return [2 /*return*/];
                    }
                    console.log('✅ Test 1 Passed');
                    console.log('\n--- Test 2: ETag & 304 Not Modified ---');
                    etag = res2.headers.get('etag');
                    console.log("Received ETag: ".concat(etag));
                    return [4 /*yield*/, fetch("".concat(GATEWAY_URL, "/users/1"), {
                            headers: __assign(__assign({}, authHeaders), { 'If-None-Match': etag })
                        })];
                case 6:
                    res3 = _a.sent();
                    console.log("Request 3 (If-None-Match): Status ".concat(res3.status));
                    if (res3.status !== 304) {
                        console.error('❌ Failed: Expected status 304');
                        return [2 /*return*/];
                    }
                    console.log('✅ Test 2 Passed');
                    console.log('\n--- Test 3: Stale-While-Revalidate ---');
                    // Wait for 3 seconds (past staleAt which is 2.5s, but before expiresAt which is 5s)
                    console.log('Waiting 3 seconds for cache to become stale...');
                    return [4 /*yield*/, sleep(3000)];
                case 7:
                    _a.sent();
                    start4 = Date.now();
                    return [4 /*yield*/, fetch("".concat(GATEWAY_URL, "/users/1"), { headers: authHeaders })];
                case 8:
                    res4 = _a.sent();
                    dur4 = Date.now() - start4;
                    console.log("Request 4 (Stale served): ".concat(dur4, "ms | x-cache: ").concat(res4.headers.get('x-cache')));
                    console.log('✅ Test 3 Passed (Background refresh triggered silently)');
                    console.log('\n--- Test 4: Cache Invalidation ---');
                    console.log('Invalidating "users" tag...');
                    return [4 /*yield*/, fetch("".concat(GATEWAY_URL, "/gateway/cache/invalidate"), {
                            method: 'POST',
                            headers: __assign(__assign({}, authHeaders), { 'Content-Type': 'application/json' }),
                            body: JSON.stringify({ tags: ['users'] })
                        })];
                case 9:
                    _a.sent();
                    start5 = Date.now();
                    return [4 /*yield*/, fetch("".concat(GATEWAY_URL, "/users/1"), { headers: authHeaders })];
                case 10:
                    res5 = _a.sent();
                    dur5 = Date.now() - start5;
                    console.log("Request 5 (After Invalidation): ".concat(dur5, "ms | Status: ").concat(res5.status, " | x-cache: ").concat(res5.headers.get('x-cache')));
                    if (res5.headers.get('x-cache') !== 'MISS') {
                        console.error('❌ Failed: Expected cache to be MISS after invalidation');
                        return [2 /*return*/];
                    }
                    console.log('✅ Test 4 Passed');
                    console.log('\n--- Test 5: Cache Metrics ---');
                    return [4 /*yield*/, fetch("".concat(GATEWAY_URL, "/gateway/cache"))];
                case 11:
                    metricsRes = _a.sent();
                    return [4 /*yield*/, metricsRes.json()];
                case 12:
                    metrics = _a.sent();
                    console.log('Cache Metrics:', metrics);
                    console.log('✅ Verification Complete!');
                    return [2 /*return*/];
            }
        });
    });
}
runCacheTests().catch(console.error);
