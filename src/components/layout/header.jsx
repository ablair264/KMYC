import { useEffect, useState } from 'react'
import { cn } from '../../lib/utils'
import { Separator } from '../ui/separator'
import { SidebarTrigger } from '../ui/sidebar'
import { Search } from '../search'

export function Header({ className, fixed = true, children, ...props }) {
  const [offset, setOffset] = useState(0)

  useEffect(() => {
    const onScroll = () => {
      setOffset(document.body.scrollTop || document.documentElement.scrollTop)
    }

    // Add scroll listener to the body
    document.addEventListener('scroll', onScroll, { passive: true })

    // Clean up the event listener on unmount
    return () => document.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={cn(
        'z-50 h-16',
        fixed && 'header-fixed peer/header sticky top-0 w-[inherit]',
        offset > 10 && fixed ? 'shadow' : 'shadow-none',
        className
      )}
      {...props}
    >
      <div
        className={cn(
          'relative flex h-full items-center gap-3 p-4 sm:gap-4 bg-background',
          offset > 10 &&
            fixed &&
            'after:bg-background/80 after:absolute after:inset-0 after:-z-10 after:backdrop-blur-lg'
        )}
      >
        <SidebarTrigger variant='outline' className='max-md:scale-125' />
        <Separator orientation='vertical' className='h-6' />
        <Search placeholder="Search vehicles, deals, providers..." />
        {children}
      </div>
    </header>
  )
}