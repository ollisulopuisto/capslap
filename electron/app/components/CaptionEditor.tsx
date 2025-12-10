import React, { useState, useRef, useEffect } from 'react'
import { Button } from '@/app/components/ui/button'
import { ArrowLeft, ArrowRight, Play, Pause, Save, Pencil, Check, X } from 'lucide-react'
import { Textarea } from '@/app/components/ui/textarea'
import { cn } from '@/lib/utils'

// Types (mirrored from app.tsx for now to avoid circular deps)
interface Template {
    id: 'oneliner' | 'karaoke' | 'vibrant' | 'storyteller'
    captionStyle: 'karaoke' | 'oneliner' | 'vibrant' | 'storyteller'
    name: string
    src: string | null
    textColor: string
    highlightWordColor: string
    outlineColor: string
    glowEffect: boolean
    font: string
    position: 'bottom' | 'center' | 'safe-center'
}

interface Settings {
    selectedTemplate: Template['id']
    exportFormats: string[]
    selectedFont: string
    // selectedModel: ModelInfo['name'] // Skipping types not needed for display
    textColor: string
    highlightWordColor: string
    outlineColor: string
    glowEffect: boolean
    captionStyle: Template['captionStyle']
    captionPosition: 'bottom' | 'center' | 'safe-center'
    // ... other settings
}

const FONT_NAMES = {
    'montserrat-black': 'Montserrat Black',
    'komika-axis': 'Komika Axis',
    theboldfont: 'THEBOLDFONT',
    'kanit-bold': 'Kanit Bold',
    'poppins-black': 'Poppins Black',
    'oswald-bold': 'Oswald Bold',
    'bangers-regular': 'Bangers Regular',
    'worksans-bold': 'WorkSans Bold',
    'roboto-bold': 'Roboto Bold',
} as const

const getFontName = (fontId: string): string => {
    return FONT_NAMES[fontId as keyof typeof FONT_NAMES] || 'Montserrat Black'
}

export interface WordSpan {
    startMs: number
    endMs: number
    text: string
}

export interface CaptionSegment {
    startMs: number
    endMs: number
    text: string
    words: WordSpan[]
}

interface CaptionEditorProps {
    initialSegments: CaptionSegment[]
    onBurn: (segments: CaptionSegment[]) => void
    onCancel: () => void
    videoPath: string
    settings: Settings
}

export function CaptionEditor({ initialSegments, onBurn, onCancel, videoPath, settings }: CaptionEditorProps) {
    const [segments, setSegments] = useState<CaptionSegment[]>(initialSegments)
    const [isPlaying, setIsPlaying] = useState(false)
    const [currentTime, setCurrentTime] = useState(0)
    const [editingSegmentIndex, setEditingSegmentIndex] = useState<number | null>(null)
    const [editText, setEditText] = useState('')
    const videoRef = useRef<HTMLVideoElement>(null)
    const activeSegmentRef = useRef<HTMLDivElement>(null)

    // Convert video path to renderable URL
    const videoUrl = videoPath.startsWith('/') ? `res://local${videoPath}` : videoPath

    useEffect(() => {
        if (activeSegmentRef.current) {
            activeSegmentRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
    }, [currentTime])

    const togglePlay = () => {
        if (videoRef.current) {
            if (isPlaying) {
                videoRef.current.pause()
            } else {
                videoRef.current.play()
            }
            setIsPlaying(!isPlaying)
        }
    }

    const handleTimeUpdate = () => {
        if (videoRef.current) {
            setCurrentTime(videoRef.current.currentTime)
        }
    }

    const seekTo = (ms: number) => {
        if (videoRef.current) {
            videoRef.current.currentTime = ms / 1000
            setCurrentTime(ms / 1000)
        }
    }

    // Move the last word of segment[index] to the beginning of segment[index+1]
    const moveLastWordToNext = (index: number) => {
        if (index < 0 || index >= segments.length - 1) return

        const current = segments[index]
        const next = segments[index + 1]

        if (current.words.length === 0) return

        const wordToMove = current.words[current.words.length - 1]

        const newCurrentWords = current.words.slice(0, -1)
        const newNextWords = [wordToMove, ...next.words]

        // Calculate new timings
        // Current segment ends at the new last word's end, or its original start if empty
        const newCurrentEndMs = newCurrentWords.length > 0
            ? newCurrentWords[newCurrentWords.length - 1].endMs
            : current.startMs

        // Next segment starts at the moved word's start
        const newNextStartMs = wordToMove.startMs

        const newCurrent: CaptionSegment = {
            ...current,
            words: newCurrentWords,
            text: newCurrentWords.map(w => w.text).join(' '),
            endMs: newCurrentEndMs
        }

        const newNext: CaptionSegment = {
            ...next,
            words: newNextWords,
            text: newNextWords.map(w => w.text).join(' '),
            startMs: newNextStartMs
        }

        const newSegments = [...segments]
        newSegments[index] = newCurrent
        newSegments[index + 1] = newNext

        // If current becomes empty, remove it?
        // Let's keep empty segments for now to avoid index shifts, or remove if desired
        if (newCurrent.words.length === 0) {
            // careful with index shifts if we remove
            // newSegments.splice(index, 1)
        }

        setSegments(newSegments)
    }

    // Move the first word of segment[index] to the end of segment[index-1]
    const moveFirstWordToPrev = (index: number) => {
        if (index <= 0 || index >= segments.length) return

        const prev = segments[index - 1]
        const current = segments[index]

        if (current.words.length === 0) return

        const wordToMove = current.words[0]

        const newPrevWords = [...prev.words, wordToMove]
        const newCurrentWords = current.words.slice(1)

        // Prev segment ends at the moved word's end
        const newPrevEndMs = wordToMove.endMs

        // Current segment starts at the new first word's start, or original end if empty
        const newCurrentStartMs = newCurrentWords.length > 0
            ? newCurrentWords[0].startMs
            : current.endMs

        const newPrev: CaptionSegment = {
            ...prev,
            words: newPrevWords,
            text: newPrevWords.map(w => w.text).join(' '),
            endMs: newPrevEndMs
        }

        const newCurrent: CaptionSegment = {
            ...current,
            words: newCurrentWords,
            text: newCurrentWords.map(w => w.text).join(' '),
            startMs: newCurrentStartMs
        }

        const newSegments = [...segments]
        newSegments[index - 1] = newPrev
        newSegments[index] = newCurrent

        setSegments(newSegments)
    }

    const handleSaveEdit = (index: number) => {
        const seg = segments[index]
        const newText = editText.trim()

        if (!newText) return // Don't allow empty segments for now? Or remove it?

        // Split into words
        const newWordsTexts = newText.split(/\s+/)
        const wordCount = newWordsTexts.length

        // Linear interpolation of timestamps
        const duration = seg.endMs - seg.startMs
        const wordDuration = duration / wordCount

        const newWords: WordSpan[] = newWordsTexts.map((word, i) => ({
            text: word,
            startMs: seg.startMs + (i * wordDuration),
            endMs: seg.startMs + ((i + 1) * wordDuration)
        }))

        const newSegment: CaptionSegment = {
            ...seg,
            text: newText,
            words: newWords
        }

        const newSegments = [...segments]
        newSegments[index] = newSegment
        setSegments(newSegments)
        setEditingSegmentIndex(null)
    }

    const renderPreviewOverlay = () => {
        const timeMs = currentTime * 1000
        const activeSeg = segments.find(s => timeMs >= s.startMs && timeMs <= s.endMs)

        if (!activeSeg) return null

        const fontName = getFontName(settings.selectedFont)
        const baseStyle = {
            fontFamily: fontName,
            color: settings.textColor,
            WebkitTextStroke: settings.outlineColor ? `2px ${settings.outlineColor}` : 'none',
            textShadow: settings.glowEffect ? `0 0 10px ${settings.highlightWordColor}` : 'none',
        }

        const positionClass = cn(
            "absolute left-0 right-0 text-center px-8 transition-all duration-200",
            settings.captionPosition === 'bottom' && "bottom-12",
            settings.captionPosition === 'center' && "top-1/2 -translate-y-1/2",
            settings.captionPosition === 'safe-center' && "top-1/2 -translate-y-1/2" // Adjust as needed
        )

        return (
            <div className={positionClass}>
                <div className="flex flex-wrap justify-center gap-[0.2em] max-w-full">
                    {activeSeg.words.map((word, idx) => {
                        const isWordActive = timeMs >= word.startMs && timeMs <= word.endMs
                        // Apply highlight color if word is active (karaoke style) OR if it's strictly the active word
                        // For non-karaoke styles (like Vibrant), usually the whole sentence is one color or user preference.
                        // Im implementing basic karaoke highlight logic here based on 'karaoke' setting or generic highlight.

                        const isHighlighted = settings.captionStyle === 'karaoke' ? isWordActive : false
                        // For 'vibrant' or others, logic might differ, but let's stick to the highlights config

                        const wordStyle = {
                            ...baseStyle,
                            color: isHighlighted ? settings.highlightWordColor : settings.textColor
                        }

                        return (
                            <span key={idx} style={wordStyle} className="text-2xl font-bold leading-tight break-words">
                                {word.text}
                            </span>
                        )
                    })}
                </div>
            </div>
        )

    }

    return (
        <div className="flex bg-[#08090a] text-white h-full w-full overflow-hidden">
            {/* Left: Video Player */}
            <div className="flex-1 relative bg-black flex flex-col justify-center items-center border-r border-white/10">
                <div className="relative w-full h-full max-h-full aspect-[9/16] max-w-md mx-auto bg-black">
                    <video
                        ref={videoRef}
                        src={videoUrl}
                        className="w-full h-full object-contain"
                        onTimeUpdate={handleTimeUpdate}
                        onPlay={() => setIsPlaying(true)}
                        onPause={() => setIsPlaying(false)}
                        playsInline
                    />

                    {/* Overlay */}
                    <div className="absolute inset-0 pointer-events-none overflow-hidden">
                        {renderPreviewOverlay()}
                    </div>

                    {/* Controls Overlay (Optional / Basic) */}
                    <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-4 opacity-0 hover:opacity-100 transition-opacity p-2 bg-gradient-to-t from-black/50 to-transparent">
                        <Button variant="ghost" size="icon" onClick={togglePlay} className="text-white hover:bg-white/20">
                            {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6" />}
                        </Button>
                    </div>
                </div>
            </div>

            {/* Right: Editor */}
            <div className="w-[450px] flex flex-col h-full bg-[#08090a] border-l border-white/10">
                <div className="flex items-center justify-between border-b border-white/10 p-4 shrink-0">
                    <h2 className="text-xl font-medium">Edit Captions</h2>
                    <div className="flex gap-2">
                        <Button variant="ghost" onClick={onCancel} size="sm">
                            Cancel
                        </Button>
                        <Button onClick={() => onBurn(segments)} size="sm" className="bg-primary hover:bg-primary/90">
                            <Save className="w-4 h-4 mr-2" />
                            Burn
                        </Button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto space-y-4 p-4">
                    {segments.map((seg, idx) => {
                        const isActive = currentTime * 1000 >= seg.startMs && currentTime * 1000 <= seg.endMs;
                        const isEditing = editingSegmentIndex === idx

                        if (isEditing) {
                            return (
                                <div key={idx} className="bg-card border border-primary rounded-lg p-4 flex flex-col gap-3">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-xs font-mono text-muted-foreground">
                                            Editing {formatTime(seg.startMs)} - {formatTime(seg.endMs)}
                                        </span>
                                    </div>
                                    <Textarea
                                        value={editText}
                                        onChange={(e) => setEditText(e.target.value)}
                                        className="min-h-[80px] text-lg font-medium"
                                        autoFocus
                                    />
                                    <div className="flex justify-end gap-2 mt-2">
                                        <Button size="sm" variant="ghost" onClick={() => setEditingSegmentIndex(null)}>
                                            <X className="w-4 h-4 mr-1" /> Cancel
                                        </Button>
                                        <Button size="sm" onClick={() => handleSaveEdit(idx)}>
                                            <Check className="w-4 h-4 mr-1" /> Save
                                        </Button>
                                    </div>
                                </div>
                            )
                        }

                        return (
                            <div
                                key={idx}
                                ref={isActive ? activeSegmentRef : null}
                                className={cn(
                                    "group bg-card/30 border border-border/30 rounded-lg p-4 flex flex-col gap-3 transition-all cursor-pointer relative",
                                    isActive ? "border-primary bg-primary/10 ring-1 ring-primary/20" : "hover:border-primary/30"
                                )}
                                onClick={() => seekTo(seg.startMs)}
                            >
                                <div className="flex items-start justify-between">
                                    <span className="text-xs font-mono text-muted-foreground bg-black/20 px-1.5 py-0.5 rounded">
                                        {formatTime(seg.startMs)} - {formatTime(seg.endMs)}
                                    </span>

                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className={cn(
                                            "h-6 w-6 transition-opacity",
                                            isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                                        )}
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            setEditingSegmentIndex(idx)
                                            setEditText(seg.text)
                                        }}
                                        title="Edit text"
                                    >
                                        <Pencil className="w-3 h-3" />
                                    </Button>
                                </div>

                                {/* Words */}
                                <div className="flex flex-wrap gap-1.5">
                                    {seg.words.map((word, wIdx) => {
                                        const isWordActive = currentTime * 1000 >= word.startMs && currentTime * 1000 <= word.endMs
                                        return (
                                            <span
                                                key={wIdx}
                                                className={cn(
                                                    "px-2 py-1 rounded text-sm border transition-colors cursor-default",
                                                    isWordActive ? "bg-primary/30 border-primary/50 text-white" : "bg-white/5 border-white/10 hover:bg-white/10 text-white/80"
                                                )}
                                                title={`${formatTime(word.startMs)} - ${formatTime(word.endMs)}`}
                                            >
                                                {word.text}
                                            </span>
                                        )
                                    })}
                                </div>

                                {/* Actions */}
                                <div className={cn(
                                    "flex items-center gap-2 mt-1 transition-opacity",
                                    isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                                )}>
                                    {/* Move start word to previous */}
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        className="h-6 px-2 text-[10px]"
                                        disabled={idx === 0 || seg.words.length === 0}
                                        onClick={(e) => { e.stopPropagation(); moveFirstWordToPrev(idx); }}
                                        title="Move first word to previous segment"
                                    >
                                        <ArrowLeft className="w-3 h-3 mr-1" />
                                        Shift Start
                                    </Button>

                                    {/* Move last word to next */}
                                    <Button
                                        variant="secondary"
                                        size="sm"
                                        className="h-6 px-2 text-[10px]"
                                        disabled={idx === segments.length - 1 || seg.words.length === 0}
                                        onClick={(e) => { e.stopPropagation(); moveLastWordToNext(idx); }}
                                        title="Move last word to next segment"
                                    >
                                        Shift End
                                        <ArrowRight className="w-3 h-3 ml-1" />
                                    </Button>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}

function formatTime(ms: number) {
    const s = ms / 1000
    const minutes = Math.floor(s / 60)
    const seconds = Math.floor(s % 60)
    const millis = Math.floor((s % 1) * 100)
    return `${minutes}:${seconds.toString().padStart(2, '0')}.${millis.toString().padStart(2, '0')}`
}

