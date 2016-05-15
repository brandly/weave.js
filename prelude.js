function (idToModule, modules, idList) {
    function require (id) {
        if (!modules[id]) {
            modules[id] = {
                exports: {}
            };
            idToModule[id][0](function requireForModule (value) {
                return require(idToModule[id][1][value])
            }, modules[id], modules[id].exports);
        }
        return modules[id].exports
    }
    for (var i = 0; i < idList.length; i++) require(idList[i]);
    return require
}
