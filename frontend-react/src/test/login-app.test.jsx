import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import LoginAppPage from '../pages/login-app'

vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(() => ({ login: vi.fn() })),
}))

function renderLoginApp() {
  return render(
    <MemoryRouter>
      <LoginAppPage />
    </MemoryRouter>
  )
}

describe('LoginAppPage', () => {
  it('renders username input, password input, Sign In and Sign Up buttons', () => {
    renderLoginApp()
    expect(screen.getByPlaceholderText('Username')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Password')).toBeInTheDocument()
    expect(screen.getByText('Sign In')).toBeInTheDocument()
    expect(screen.getByText('Sign Up')).toBeInTheDocument()
  })

  it('shows an error if Sign In is clicked with no username', async () => {
    renderLoginApp()
    await userEvent.click(screen.getByText('Sign In'))
    expect(screen.getByText('Please enter Username')).toBeInTheDocument()
  })

  it('shows an error if Sign In is clicked with no password', async () => {
    renderLoginApp()
    await userEvent.type(screen.getByPlaceholderText('Username'), 'testuser')
    await userEvent.click(screen.getByText('Sign In'))
    expect(screen.getByText('Please enter Password')).toBeInTheDocument()
  })
})
