#![no_std]
use core::panic::PanicInfo;
#[panic_handler]
fn panic(_: &PanicInfo) -> ! { loop {} }

#[derive(Clone, Copy)]
struct Entry { priority: u32, instance: u32, index: u32 }

#[inline(always)]
unsafe fn read(base: *const u32, i: usize) -> Entry {
    let p = base.add(i * 3);
    Entry { priority: *p, instance: *p.add(1), index: *p.add(2) }
}
#[inline(always)]
unsafe fn write(base: *mut u32, i: usize, e: Entry) {
    let p = base.add(i * 3);
    *p = e.priority; *p.add(1) = e.instance; *p.add(2) = e.index;
}
#[inline(always)]
fn greater(a: Entry, b: Entry) -> bool {
    let x = f32::from_bits(a.priority);
    let y = f32::from_bits(b.priority);
    if x > y { return true; }
    if x < y { return false; }
    if x.is_nan() != y.is_nan() { return x.is_nan(); }
    a.instance > b.instance || (a.instance == b.instance && a.index > b.index)
}

// Exact existing ABI: Option<(OrderedFloat<f32>, u32, u32)> into out;
// Vec layout at heap is [capacity, data pointer, length]. No allocation.
#[no_mangle]
pub unsafe extern "C" fn heap_pop(out: *mut u32, heap: *mut u32) {
    let len = *heap.add(2) as usize;
    if len == 0 { *out = 0; return; }
    let base = *heap.add(1) as *mut u32;
    let result = read(base, 0);
    let last = read(base, len - 1);
    let n = len - 1;
    *heap.add(2) = n as u32;
    if n > 0 {
        let mut at = 0;
        loop {
            let left = at * 2 + 1;
            if left >= n { break; }
            let mut child = left;
            let mut best = read(base, child);
            if left + 1 < n {
                let right = read(base, left + 1);
                if greater(right, best) { child = left + 1; best = right; }
            }
            if !greater(best, last) { break; }
            write(base, at, best);
            at = child;
        }
        write(base, at, last);
    }
    *out = 1;
    *out.add(1) = result.priority;
    *out.add(2) = result.instance;
    *out.add(3) = result.index;
}
