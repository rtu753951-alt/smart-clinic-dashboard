const OriginalDate = Date;
const FIXED_TIME = new OriginalDate('2025-12-01T00:00:00+08:00').getTime();

globalThis.Date = new Proxy(OriginalDate, {
    construct(target, args) {
        if (args.length === 0) {
            return new target(FIXED_TIME);
        }
        return new target(...args);
    },
    apply(target, thisArg, args) {
        if (args.length === 0) {
            return new target(FIXED_TIME).toString();
        }
        return target.apply(thisArg, args);
    }
});
globalThis.Date.now = () => FIXED_TIME;
globalThis.Date.parse = OriginalDate.parse;
globalThis.Date.UTC = OriginalDate.UTC;

try {
    const d = new Date();
    console.log("Date instance created:", d.toString());
    console.log("toISOString:", d.toISOString());
    console.log("Split date:", d.toISOString().split('T')[0]);
    console.log("Success!");
} catch (e) {
    console.error("Crash!", e);
}
