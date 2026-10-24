import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { Flip } from 'gsap/Flip'
import { useGSAP } from '@gsap/react'

gsap.registerPlugin(ScrollTrigger, Flip, useGSAP)

/** Use inside gsap.matchMedia(): animations only run when this matches. */
export const MOTION_OK = '(prefers-reduced-motion: no-preference)'

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

export { gsap, ScrollTrigger, Flip, useGSAP }
