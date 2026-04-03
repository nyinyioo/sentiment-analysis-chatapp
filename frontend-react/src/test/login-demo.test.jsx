import React from 'react'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import LoginDemoPage from '../pages/login-demo'

vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(() => ({ login: vi.fn() })),
}))

function renderLoginDemo() {
  return render(
    <MemoryRouter>
      <LoginDemoPage />
    </MemoryRouter>
  )
}

describe('LoginDemoPage', () => {
  it('renders the Enter Demo and Enter App buttons', () => {
    renderLoginDemo()
    expect(screen.getByText('Enter Demo')).toBeInTheDocument()
    expect(screen.getByText('Enter App')).toBeInTheDocument()
  })
})
