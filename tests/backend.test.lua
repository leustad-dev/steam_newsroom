local calls, ready = 0, false
local response = { status = 200, body = '{"appnews":{"appid":570,"newsitems":[]}}' }
package.preload["millennium"] = function() return { ready = function() ready = true end } end
package.preload["http"] = function() return { get = function(url, options)
    calls = calls + 1
    if url:match("^https://store%.steampowered%.com/api/appdetails%?appids=570$") then
        assert(options.timeout == 10 and options.verify_ssl and options.follow_redirects == false)
        return response
    end
    if url:match("^https://store%.steampowered%.com/api/storesearch/%?") then
        assert(url:find("term=Hades%%20%%26%%20II$"))
        assert(options.timeout == 10 and options.verify_ssl and options.follow_redirects == false)
        return response
    end
    assert(url:match("^https://api%.steampowered%.com/ISteamNews/GetNewsForApp/v2/"))
    assert(url:find("appid=570", 1, true))
    assert(url:find("feeds=steam_community_announcements", 1, true))
    assert(url:find("maxlength=0", 1, true), "Request full posts, not truncated blurbs")
    assert(url:find("count=20", 1, true))
    assert(options.timeout == 12 and options.verify_ssl and options.follow_redirects == false)
    return response
end } end
-- Match the confirmed host contract: no cjson/json or other extra modules exist.
local loaded_modules = {}
local environment = setmetatable({ require = function(name)
    assert(name == "millennium" or name == "http", "Unexpected backend dependency: " .. tostring(name))
    loaded_modules[name] = true
    return require(name)
end }, { __index = _G })
local entry = assert(loadfile("backend/main.lua"))
setfenv(entry, environment)
local plugin = entry()
local fetch_news = environment.fetch_news
plugin.on_load()
assert(ready)
assert(loaded_modules.millennium and loaded_modules.http)
assert(fetch_news(570, 0) == response.body)
assert(fetch_news(570, 1700000000) == response.body)
assert(environment.fetch_artwork(570) == response.body)
assert(environment.search_games("Hades & II") == response.body)
local before_search = calls
assert(environment.search_games("x"):find("Search needs", 1, true))
assert(environment.search_games(string.rep("a", 201)):find("Search needs", 1, true))
assert(environment.search_games("bad\nquery"):find("Search needs", 1, true))
assert(calls == before_search)
local before_artwork = calls
assert(environment.fetch_artwork("570"):find("Invalid game identifier", 1, true))
assert(environment.fetch_artwork(-1):find("Invalid game identifier", 1, true))
assert(calls == before_artwork)
local previous = calls
assert(fetch_news(-1, 0):find("Invalid game identifier", 1, true))
assert(fetch_news("570", 0):find("Invalid game identifier", 1, true))
assert(fetch_news(570, -1):find("Invalid news cursor", 1, true))
assert(fetch_news(570, 1.5):find("Invalid news cursor", 1, true))
assert(calls == previous)
response = { status = 429 }
assert(environment.fetch_artwork(570):find("metadata is unavailable", 1, true))
assert(fetch_news(570, 0) == '{"error":"Steam news returned HTTP 429.","status":429}')
response = { status = 'bad "status"' }
assert(fetch_news(570, 0) == '{"error":"Steam news returned an invalid HTTP response."}')
response = { status = 200, body = string.rep("x", 2097153) }
assert(fetch_news(570, 0):find("oversized", 1, true))
response = nil
assert(fetch_news(570, 0):find("could not be reached", 1, true))
-- Let Node validate that every failure payload is genuine JSON, not a test encoding stub.
local reports = {
    fetch_news(-1, 0), fetch_news(570, -1), fetch_news(570, 0),
}
response = { status = 503 }
reports[#reports + 1] = fetch_news(570, 0)
response = { status = 'invalid' }
reports[#reports + 1] = fetch_news(570, 0)
response = { status = 200, body = string.rep("x", 2097153) }
reports[#reports + 1] = fetch_news(570, 0)
print("ERROR_PAYLOADS=" .. "[" .. table.concat(reports, ",") .. "]")
print("Lua backend contracts passed")
