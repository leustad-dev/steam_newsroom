local millennium = require("millennium")
local http = require("http")

---@ffi
---@param appid number
---@return string
function fetch_artwork(appid)
    if type(appid) ~= "number" or appid ~= math.floor(appid) or appid < 1 or appid > 4294967295 then
        return '{"error":"Invalid game identifier."}'
    end
    local ok, response = pcall(http.get, "https://store.steampowered.com/api/appdetails?appids=" .. string.format("%.0f", appid), {
        timeout = 10, verify_ssl = true, follow_redirects = false,
    })
    if not ok or not response or response.status ~= 200 or type(response.body) ~= "string" or #response.body > 2097152 then
        return '{"error":"Artwork metadata is unavailable."}'
    end
    return response.body
end

-- Fixed public endpoint; the query is percent-encoded byte by byte.
---@ffi
---@param query string
---@return string
function search_games(query)
    if type(query) ~= "string" or #query < 2 or #query > 200 or query:find("[%z\1-\31]") then
        return '{"error":"Search needs 2 to 200 bytes of text."}'
    end
    local encoded = query:gsub("([^%w%-_%.~])", function(char) return string.format("%%%02X", string.byte(char)) end)
    local ok, response = pcall(http.get, "https://store.steampowered.com/api/storesearch/?l=english&cc=US&term=" .. encoded, {
        timeout = 10, verify_ssl = true, follow_redirects = false,
    })
    if not ok or not response or response.status ~= 200 or type(response.body) ~= "string" or #response.body > 1048576 then
        return '{"error":"Steam game search is unavailable. Try again later."}'
    end
    return response.body
end

local CACHE_LIMIT = 16777216
local function cache_path(create)
    -- Optional module: failure must disable persistence, never plugin startup/news.
    local fs = require("fs")
    local root = os.getenv("MILLENNIUM__CONFIG_PATH")
    if not root or root == "" then error("Millennium data directory is unavailable") end
    local directory = fs.join(root, "steam-newsroom")
    if create and not fs.is_directory(directory) and not fs.create_directories(directory) then error("Cannot create cache directory") end
    return fs, fs.join(directory, "cache-v1.json")
end

---@ffi
---@return string
function read_cache()
    local ok, result = pcall(function()
        local fs, path = cache_path(false)
        if not fs.exists(path) then return '{"missing":true}' end
        if fs.is_symlink(path) then error("Cache is a symbolic link") end
        local file = assert(io.open(path, "rb"))
        local data = file:read(CACHE_LIMIT + 1)
        file:close()
        if not data or #data > CACHE_LIMIT then error("Invalid cache size") end
        return data
    end)
    return ok and result or '{"error":"Saved news could not be read. Refreshing from Steam."}'
end

---@ffi
---@param payload string
---@return string
function write_cache(payload)
    if type(payload) ~= "string" or #payload > CACHE_LIMIT then
        return '{"error":"News cache exceeds the storage limit."}'
    end
    local ok = pcall(function()
        local fs, path = cache_path(true)
        local temporary = path .. ".tmp"
        if fs.is_symlink(path) or fs.is_symlink(temporary) then error("Cache is a symbolic link") end
        local file = assert(io.open(temporary, "wb"))
        local written = file:write(payload)
        local flushed = file:flush()
        local closed = file:close()
        if not written or not flushed or not closed then fs.remove(temporary); error("Cache write failed") end
        if not fs.rename(temporary, path, false) then fs.remove(temporary); error("Cache replacement failed") end
    end)
    return ok and '{"ok":true}' or '{"error":"News could not be saved for next time. Current news is still available."}'
end

---@ffi
---@return string
function clear_cache()
    local ok = pcall(function()
        local fs, path = cache_path(false)
        if fs.exists(path) and not fs.remove(path) then error("Cache removal failed") end
        if fs.exists(path .. ".tmp") and not fs.remove(path .. ".tmp") then error("Temporary cache removal failed") end
    end)
    return ok and '{"ok":true}' or '{"error":"Saved news could not be cleared."}'
end

---@ffi
---@param appid number
---@param before number
---@return string
function fetch_news(appid, before)
    if type(appid) ~= "number" or appid ~= math.floor(appid) or appid < 1 or appid > 4294967295 then
        return '{"error":"Invalid game identifier."}'
    end
    if type(before) ~= "number" or before ~= math.floor(before) or before < 0 or before > 4294967295 then
        return '{"error":"Invalid news cursor."}'
    end
    local url = "https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid="
        .. string.format("%.0f", appid)
        .. "&count=20&maxlength=0&feeds=steam_community_announcements"
    if before > 0 then url = url .. "&enddate=" .. string.format("%.0f", before) end
    local ok, response = pcall(http.get, url, {
        timeout = 12, verify_ssl = true, follow_redirects = false,
    })
    if not ok or not response then
        return '{"error":"Steam news could not be reached. Try again later."}'
    end
    if response.status ~= 200 then
        local status = response.status
        if type(status) ~= "number" or status ~= math.floor(status) or status < 100 or status > 599 then
            return '{"error":"Steam news returned an invalid HTTP response."}'
        end
        -- Only a validated integer is interpolated; no serializer/native JSON module is required.
        return string.format('{"error":"Steam news returned HTTP %d.","status":%d}', status, status)
    end
    if type(response.body) ~= "string" or #response.body > 2097152 then
        return '{"error":"Steam news returned an invalid or oversized response."}'
    end
    return response.body
end

return {
    on_load = function() millennium.ready() end,
    on_unload = function() end,
}
