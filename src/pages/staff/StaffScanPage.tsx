import React, { useEffect, useRef, useState, useCallback } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'
import type { IScannerControls } from '@zxing/browser'
import { Camera, CameraOff, Search, X, CheckCircle2, AlertTriangle, RotateCcw, Loader2 } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { getAdapter } from '../../lib/get-adapter'
import { Navbar } from '../../components/Navbar'
import { DemoBanner } from '../../components/ui/DemoBanner'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Dialog } from '../../components/ui/Dialog'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { useToast } from '../../contexts/ToastContext'
import { formatDateTime } from '../../utils'
import type { ScanPreviewResult, RedeemResult } from '../../types'

type ScanState =
  | { type: 'idle' }
  | { type: 'scanning' }
  | { type: 'loading' }
  | { type: 'preview'; data: ScanPreviewResult; token: string }
  | { type: 'redeeming' }
  | { type: 'success'; result: RedeemResult }
  | { type: 'already_collected'; result: RedeemResult }
  | { type: 'invalid' }
  | { type: 'error'; message: string }
  | { type: 'camera_denied' }

type TabMode = 'camera' | 'manual'

export function StaffScanPage() {
  const { session } = useAuth()
  const { toast } = useToast()
  const adapter = getAdapter()

  const videoRef = useRef<HTMLVideoElement>(null)
  const controlsRef = useRef<IScannerControls | null>(null)
  const lastTokenRef = useRef<string>('')
  const scanCooldownRef = useRef<boolean>(false)

  const [tab, setTab] = useState<TabMode>('camera')
  const [scanState, setScanState] = useState<ScanState>({ type: 'idle' })
  const [cameraActive, setCameraActive] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<ScanPreviewResult[]>([])
  const [searching, setSearching] = useState(false)
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    token?: string
    participant?: ScanPreviewResult
    isManual?: boolean
  }>({ open: false })

  // ─── Camera ──────────────────────────────────────────────────────────────

  const stopCamera = useCallback(() => {
    if (controlsRef.current) {
      controlsRef.current.stop()
      controlsRef.current = null
    }
    setCameraActive(false)
    lastTokenRef.current = ''
  }, [])

  const handleTokenScanned = useCallback(async (token: string) => {
    setScanState({ type: 'loading' })
    try {
      const data = await adapter.lookupByToken(token)
      if (!data) {
        setScanState({ type: 'invalid' })
        await adapter.recordScanEvent(session!.user.id, null, 'invalid_token', '[redacted]')
      } else if (data.gift_status === 'collected') {
        setScanState({
          type: 'already_collected',
          result: {
            result: 'already_collected',
            participant_name: data.name,
            participant_display_id: data.participant_display_id,
            redeemed_at: data.redeemed_at,
            message: 'Gift was already collected.',
          },
        })
        await adapter.recordScanEvent(session!.user.id, data.participant_id, 'already_collected', 'Duplicate scan')
      } else {
        setScanState({ type: 'preview', data, token })
      }
    } catch (err: unknown) {
      setScanState({ type: 'error', message: (err as Error).message })
    }
  }, [adapter, session])

  const startCamera = useCallback(async () => {
    if (!videoRef.current) return
    setScanState({ type: 'idle' })
    try {
      const reader = new BrowserMultiFormatReader()
      const controls = await reader.decodeFromConstraints(
        { video: { facingMode: 'environment' } },
        videoRef.current,
        async (result, _err) => {
          if (scanCooldownRef.current) return
          if (result) {
            const token = result.getText()
            if (token === lastTokenRef.current) return
            lastTokenRef.current = token
            scanCooldownRef.current = true
            stopCamera()
            await handleTokenScanned(token)
            setTimeout(() => { scanCooldownRef.current = false }, 2000)
          }
        }
      )
      controlsRef.current = controls
      setCameraActive(true)
      setScanState({ type: 'scanning' })
    } catch (err: unknown) {
      const msg = (err as Error).message || ''
      if (msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('notallowed')) {
        setScanState({ type: 'camera_denied' })
      } else {
        setScanState({ type: 'error', message: 'Could not start camera: ' + msg })
      }
    }
  }, [handleTokenScanned, stopCamera])

  useEffect(() => {
    return () => { stopCamera() }
  }, [stopCamera])

  useEffect(() => {
    if (tab === 'camera') {
      startCamera()
    } else {
      stopCamera()
      setScanState({ type: 'idle' })
    }
  }, [tab]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Redemption ───────────────────────────────────────────────────────────

  const handleConfirmRedeem = async (token: string | null, participantId: string | null) => {
    setConfirmDialog({ open: false })
    setScanState({ type: 'redeeming' })
    try {
      let result: RedeemResult
      if (participantId && !token) {
        // Manual-search path: redeem by participant UUID (no raw QR token needed)
        result = await adapter.redeemGiftById(participantId, session!.user.id)
      } else if (token) {
        // Camera-scan path: redeem by QR token
        result = await adapter.redeemGift(token, session!.user.id)
      } else {
        setScanState({ type: 'error', message: 'No participant or token to redeem.' })
        return
      }
      if (result.result === 'success') {
        setScanState({ type: 'success', result })
        toast(`Gift issued to ${result.participant_name}`, 'success')
      } else if (result.result === 'already_collected') {
        setScanState({ type: 'already_collected', result })
      } else {
        setScanState({ type: 'invalid' })
      }
    } catch (err: unknown) {
      setScanState({ type: 'error', message: (err as Error).message })
    }
  }

  // ─── Manual search ────────────────────────────────────────────────────────

  const handleSearch = async () => {
    if (!searchQuery.trim()) return
    setSearching(true)
    try {
      const results = await adapter.lookupByIdOrName(searchQuery)
      setSearchResults(results)
    } catch (err: unknown) {
      toast((err as Error).message, 'error')
    } finally {
      setSearching(false)
    }
  }

  const handleManualSelect = (participant: ScanPreviewResult) => {
    if (participant.gift_status === 'collected') {
      setScanState({
        type: 'already_collected',
        result: {
          result: 'already_collected',
          participant_name: participant.name,
          participant_display_id: participant.participant_display_id,
          redeemed_at: participant.redeemed_at,
          message: 'Gift was already collected.',
        },
      })
    } else {
      setConfirmDialog({ open: true, participant, isManual: true })
    }
  }

  const resetScanner = () => {
    setScanState({ type: 'idle' })
    lastTokenRef.current = ''
    scanCooldownRef.current = false
    setSearchResults([])
    setSearchQuery('')
    if (tab === 'camera') {
      startCamera()
    }
  }

  // ─── Render helpers ───────────────────────────────────────────────────────

  const renderScanResult = () => {
    const state = scanState

    if (state.type === 'loading' || state.type === 'redeeming') {
      return (
        <div className="flex flex-col items-center gap-4 py-12">
          <Loader2 className="h-10 w-10 animate-spin text-brand-teal" />
          <p className="text-sm text-gray-600">
            {state.type === 'loading' ? 'Looking up participant…' : 'Issuing gift…'}
          </p>
        </div>
      )
    }

    if (state.type === 'preview') {
      return (
        <div className="space-y-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-lg font-bold text-ink">{state.data.name}</p>
                <p className="text-sm font-mono text-gray-500">{state.data.participant_display_id}</p>
              </div>
              <StatusBadge status={state.data.gift_status} />
            </div>
            <hr className="border-gray-100" />
            <p className="text-sm text-gray-600">
              Verify the participant's identity before handing over the gift.
            </p>
          </div>
          <Button
            fullWidth
            onClick={() => setConfirmDialog({ open: true, token: state.token, participant: state.data })}
            icon={<CheckCircle2 className="h-5 w-5" />}
            className="py-4 text-base"
          >
            Confirm Gift Issued
          </Button>
          <Button variant="secondary" fullWidth onClick={resetScanner} icon={<RotateCcw className="h-4 w-4" />}>
            Scan Again
          </Button>
        </div>
      )
    }

    if (state.type === 'success') {
      return (
        <div className="flex flex-col items-center gap-4 py-8 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
            <CheckCircle2 className="h-10 w-10 text-green-600" />
          </div>
          <div>
            <p className="text-xl font-extrabold text-green-700">Gift Issued!</p>
            <p className="text-base font-semibold text-ink mt-1">{state.result.participant_name}</p>
            <p className="text-sm font-mono text-gray-500">{state.result.participant_display_id}</p>
            {state.result.redeemed_at && (
              <p className="text-xs text-gray-400 mt-1">{formatDateTime(state.result.redeemed_at)}</p>
            )}
          </div>
          <Button fullWidth onClick={resetScanner} icon={<Camera className="h-4 w-4" />}>
            Scan Next Participant
          </Button>
        </div>
      )
    }

    if (state.type === 'already_collected') {
      return (
        <div className="space-y-4">
          <div className="rounded-2xl border-2 border-red-300 bg-red-50 p-5 text-center">
            <AlertTriangle className="h-10 w-10 text-red-600 mx-auto mb-3" />
            <p className="text-lg font-extrabold text-red-700 uppercase tracking-wide">Already Collected</p>
            <p className="text-base font-semibold text-ink mt-1">{state.result.participant_name}</p>
            <p className="text-sm font-mono text-gray-600">{state.result.participant_display_id}</p>
            {state.result.redeemed_at && (
              <p className="text-sm text-gray-500 mt-2">
                Collected: {formatDateTime(state.result.redeemed_at)}
              </p>
            )}
          </div>
          <div className="alert-warning">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            <p>Do NOT issue another gift. Contact a supervisor if needed.</p>
          </div>
          <Button variant="secondary" fullWidth onClick={resetScanner} icon={<RotateCcw className="h-4 w-4" />}>
            Scan Again
          </Button>
        </div>
      )
    }

    if (state.type === 'invalid') {
      return (
        <div className="space-y-4">
          <div className="rounded-2xl border-2 border-red-300 bg-red-50 p-5 text-center">
            <X className="h-10 w-10 text-red-500 mx-auto mb-3" />
            <p className="text-lg font-extrabold text-red-700 uppercase">Invalid QR Code</p>
            <p className="text-sm text-gray-600 mt-2">
              This QR code was not recognised. Ensure you scanned the correct pass.
            </p>
          </div>
          <Button variant="secondary" fullWidth onClick={resetScanner} icon={<RotateCcw className="h-4 w-4" />}>
            Try Again
          </Button>
        </div>
      )
    }

    if (state.type === 'error') {
      return (
        <div className="space-y-4">
          <div className="alert-error">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            <p>{state.message}</p>
          </div>
          <Button variant="secondary" fullWidth onClick={resetScanner} icon={<RotateCcw className="h-4 w-4" />}>
            Try Again
          </Button>
        </div>
      )
    }

    if (state.type === 'camera_denied') {
      return (
        <div className="space-y-4">
          <div className="rounded-2xl border-2 border-amber-200 bg-amber-50 p-5 text-center">
            <CameraOff className="h-10 w-10 text-amber-600 mx-auto mb-3" />
            <p className="text-base font-bold text-amber-800">Camera Access Denied</p>
            <p className="text-sm text-gray-600 mt-2">
              Please allow camera access in your browser settings, then reload the page.
            </p>
          </div>
          <Button onClick={() => setTab('manual')} variant="secondary" fullWidth icon={<Search className="h-4 w-4" />}>
            Use Manual Search Instead
          </Button>
        </div>
      )
    }

    return null
  }

  return (
    <div className="min-h-dvh bg-cloud">
      <DemoBanner />
      <Navbar title="Gift Scanner" />

      <div className="mx-auto max-w-lg px-4 py-6 space-y-5">
        {/* Tab selector */}
        <div className="card p-1 flex gap-1">
          {(['camera', 'manual'] as TabMode[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition-colors ${
                tab === t
                  ? 'bg-brand-teal text-white shadow-sm'
                  : 'text-gray-500 hover:text-ink hover:bg-gray-50'
              }`}
            >
              {t === 'camera' ? <Camera className="h-4 w-4" /> : <Search className="h-4 w-4" />}
              {t === 'camera' ? 'Scan QR' : 'Manual Search'}
            </button>
          ))}
        </div>

        {/* Camera viewport */}
        {tab === 'camera' && (
          <div className="card overflow-hidden">
            <div className="scanner-viewport relative bg-ink aspect-square max-h-72 overflow-hidden">
              <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
              {/* Scan frame overlay */}
              {(scanState.type === 'scanning') && cameraActive && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="h-48 w-48 rounded-2xl border-2 border-white/60 shadow-[0_0_0_9999px_rgba(0,0,0,0.4)] relative">
                    <div className="absolute -top-0.5 -left-0.5 h-6 w-6 border-t-4 border-l-4 border-white rounded-tl-xl" />
                    <div className="absolute -top-0.5 -right-0.5 h-6 w-6 border-t-4 border-r-4 border-white rounded-tr-xl" />
                    <div className="absolute -bottom-0.5 -left-0.5 h-6 w-6 border-b-4 border-l-4 border-white rounded-bl-xl" />
                    <div className="absolute -bottom-0.5 -right-0.5 h-6 w-6 border-b-4 border-r-4 border-white rounded-br-xl" />
                  </div>
                </div>
              )}
              {!cameraActive && (scanState.type === 'idle') && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-900/80">
                  <div className="text-center text-white">
                    <Camera className="h-10 w-10 mx-auto mb-2 text-gray-400" />
                    <p className="text-sm text-gray-300">Starting camera…</p>
                  </div>
                </div>
              )}
            </div>
            {cameraActive && (
              <div className="p-3 border-t border-gray-100 flex items-center justify-between">
                <p className="text-sm text-gray-500">Point camera at participant's QR code</p>
                <Button variant="ghost" size="sm" onClick={stopCamera} icon={<CameraOff className="h-4 w-4" />}>
                  Stop
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Manual search */}
        {tab === 'manual' && (
          <div className="card p-4 space-y-3">
            <p className="text-sm font-semibold text-ink">Search by Participant ID or Name</p>
            <div className="flex gap-2">
              <Input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="GFT-0001 or full name"
                className="flex-1"
              />
              <Button onClick={handleSearch} loading={searching} icon={<Search className="h-4 w-4" />}>
                Search
              </Button>
            </div>

            {searchResults.length > 0 && (
              <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 overflow-hidden">
                {searchResults.map((r) => (
                  <button
                    key={r.participant_id}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors text-left"
                    onClick={() => handleManualSelect(r)}
                  >
                    <div>
                      <p className="text-sm font-semibold text-ink">{r.name}</p>
                      <p className="text-xs font-mono text-gray-500">{r.participant_display_id}</p>
                    </div>
                    <StatusBadge status={r.gift_status} size="sm" />
                  </button>
                ))}
              </div>
            )}

            {searchResults.length === 0 && searchQuery && !searching && (
              <p className="text-sm text-gray-400 text-center py-4">No results found</p>
            )}
          </div>
        )}

        {/* Result area */}
        {scanState.type !== 'idle' && scanState.type !== 'scanning' && (
          <div className="card p-5">
            {renderScanResult()}
          </div>
        )}
      </div>

      {/* Confirmation dialog */}
      <Dialog
        open={confirmDialog.open}
        onClose={() => setConfirmDialog({ open: false })}
        title="Confirm Gift Handover"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDialog({ open: false })}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (confirmDialog.isManual) {
                  // Manual search path: use participant UUID — never a fake token
                  handleConfirmRedeem(null, confirmDialog.participant?.participant_id ?? null)
                } else {
                  // Camera scan path: use the real QR token
                  handleConfirmRedeem(confirmDialog.token ?? null, null)
                }
              }}
              icon={<CheckCircle2 className="h-4 w-4" />}
            >
              Confirm Issued
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-xl bg-gray-50 p-4">
            <p className="text-base font-bold text-ink">{confirmDialog.participant?.name}</p>
            <p className="text-sm font-mono text-gray-500">{confirmDialog.participant?.participant_display_id}</p>
          </div>
          <div className="alert-warning">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            <div>
              <p className="font-semibold">Verify identity before confirming.</p>
              <p className="mt-0.5">Once confirmed, this participant's gift will be marked as collected and cannot be undone.</p>
            </div>
          </div>
        </div>
      </Dialog>
    </div>
  )
}
