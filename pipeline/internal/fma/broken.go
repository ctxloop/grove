package fma

// BrokenAudio holds the tracks whose MP3 in fma_medium.zip cannot be decoded
// (133297 is also in fma_small.zip, with the same file): ffmpeg fails on each
// of them in `grove-pipeline audio`. The archives
// are fixed and checked by SHA1, so this list is too. These tracks are left
// out of the world, so no tree is silent.
var BrokenAudio = map[int]bool{
	1486:   true,
	5574:   true,
	65753:  true,
	80391:  true,
	98558:  true,
	98559:  true,
	98560:  true,
	98571:  true,
	105247: true,
	126981: true,
	127336: true,
	133297: true,
}
