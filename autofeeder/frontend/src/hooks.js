import { useCallback, useEffect, useRef, useState } from 'react'

export function usePolling(loader, intervalMs = 3000, deps = []) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const mounted = useRef(true)
  const busy = useRef(false)
  const loaderRef = useRef(loader)
  loaderRef.current = loader

  const run = useCallback(async (silent = false) => {
    if (busy.current) return
    busy.current = true
    if (!silent) setLoading(true)
    try {
      const result = await loaderRef.current()
      if (mounted.current) {
        setData(result)
        setError(null)
      }
    } catch (err) {
      if (mounted.current) setError(err)
    } finally {
      busy.current = false
      if (mounted.current && !silent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    mounted.current = true
    run(false)
    const timer = intervalMs ? setInterval(() => run(true), intervalMs) : null
    return () => {
      mounted.current = false
      if (timer) clearInterval(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, ...deps])

  return { data, error, loading, refresh: () => run(true), reload: () => run(false), setData }
}

export function useClock() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])
  return now
}
