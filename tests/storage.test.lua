local root = assert(arg[1])
local path = root .. '/steam-newsroom/cache-v1.json'
local rename_fails, missing_module, missing_root, symbolic, mkdir_fails = false, false, false, false, false
local fs = {
    join = function(...) return table.concat({...}, '/') end,
    is_directory = function() return not mkdir_fails end,
    create_directories = function() return not mkdir_fails end,
    exists = function(p) local f = io.open(p, 'rb'); if f then f:close(); return true end; return false end,
    is_symlink = function() return symbolic end,
    remove = os.remove,
    rename = function(from, to) if rename_fails then return nil, 'denied' end; return os.rename(from, to) end,
}
local ready = false
local env = setmetatable({
    os = { getenv = function(name) assert(name == 'MILLENNIUM__CONFIG_PATH'); return not missing_root and root or nil end },
    require = function(name)
        if name == 'millennium' then return { ready = function() ready = true end } end
        if name == 'http' then return {} end
        if name == 'fs' and not missing_module then return fs end
        error('Unavailable module: ' .. name)
    end,
}, {__index = _G})
local entry = assert(loadfile('backend/main.lua')); setfenv(entry, env)
local plugin = entry(); plugin.on_load(); assert(ready)
assert(env.read_cache() == '{"missing":true}')
local good = '{"version":1,"id":"18446744073709551615"}'
assert(env.write_cache(good) == '{"ok":true}')
assert(env.read_cache() == good)
assert(not fs.exists(path .. '.tmp'))
-- Existing directories do not count as a create_directories failure.
assert(env.write_cache(good) == '{"ok":true}')
rename_fails = true
assert(env.write_cache('replacement'):find('could not be saved', 1, true))
assert(env.read_cache() == good)
assert(not fs.exists(path .. '.tmp'))
rename_fails = false
-- A crash before rename leaves the last committed version readable.
local f = assert(io.open(path .. '.tmp', 'wb')); f:write('interrupted'); f:close()
assert(env.read_cache() == good)
assert(env.write_cache({}):find('limit', 1, true))
assert(env.write_cache(string.rep('x', 16777217)):find('limit', 1, true))
assert(env.read_cache() == good)
symbolic = true
assert(env.write_cache('blocked'):find('could not be saved', 1, true))
assert(env.read_cache():find('could not be read', 1, true))
symbolic = false
missing_module = true
assert(env.read_cache():find('could not be read', 1, true))
assert(env.write_cache('blocked'):find('could not be saved', 1, true))
missing_module = false
missing_root = true
assert(env.read_cache():find('could not be read', 1, true))
missing_root = false
mkdir_fails = true
assert(env.write_cache('blocked'):find('could not be saved', 1, true))
mkdir_fails = false
assert(env.read_cache() == good)
-- Verify the read bound even for an externally modified file.
f = assert(io.open(path, 'wb')); f:write(string.rep('x', 16777217)); f:close()
assert(env.read_cache():find('could not be read', 1, true))
f = assert(io.open(path, 'wb')); f:write('malformed JSON'); f:close()
assert(env.read_cache() == 'malformed JSON') -- Frontend validates the schema/JSON.
local unrelated = root .. '/keep.txt'
f = assert(io.open(unrelated, 'wb')); f:write('keep'); f:close()
assert(env.clear_cache() == '{"ok":true}')
assert(not fs.exists(path) and not fs.exists(path .. '.tmp'))
assert(fs.exists(unrelated))
assert(env.clear_cache() == '{"ok":true}')
print('Lua storage contracts passed')
