/**
 * login-app.jsx
 * - Login and signup form for the app
 * - Equivalent to login-app.ejs in the EJS version
 */

// import hooks and API services 
import { useState } from "react"
import { useNavigate } from "react-router-dom"
import {login, signup} from "../services/auth"
import "../styles/login-app.css" 


function LoginAppPage() {
    /**
     * useState is a React hook that add state to functional components.
     * const [state, setState] = useState (initialState)
     */
    const [username, setUsername ] = useState('')    // tracks the username input
    const [password, setPassword ] = useState('')    // tracks the password input
    const [error, setError ] = useState('')          // tracks any error messages to display
    const [loading, setLoading ] = useState(false)   // tracks whether a login/signup request is in progress 
                                                     // (to disable buttons and show loading state)

    /**
     * 
     * useNavigate is a React Hook that redirects to different routes
     * navigate('/login') replaces window.location.href = '/login'in EJS 
     * const navigate = useNavigate()
    */
    const navigate = useNavigate()


    /**
     * handleSubmit called by both Sign In and Sign Up buttons
     * @param {Function} authFn - either login() or signup() from services/auth.js
     */
    async function handleSubmit (authFn) {

        if (!username || !password){
            setError("Please enter Username and Password")
            return
        }

        setError('')                 // clear any prev error 
        setLoading(true)             // disable buttons while waiting for response

        try{
            await authFn (username, password)
            navigate('/lobby')       // on success, redirect to lobby page
        } catch (err) {              // err.message comes from throw in services/auth.js
            setError(err.message)
        } finally{             
            setLoading(false)        // reenable buttons
        }
    }


  return (
    <div className="login-body"> 
        <div className="login-container">
            <h2>Chatapp</h2>
                
                {/* conditinally render error message*/}
                {error && <div className = "error-message"> {error} </div>}


                {/* handle username */}
                <div className = "form-group">
                    <input 
                    type = "text"
                    placeholder="Username"
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    />
                </div>

                {/* handle input password */}
                <div className = "form-group">
                    <input 
                    type = "password"
                    placeholder="Password"
                    autoComplete="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    />
                </div>

                {/* handle login and signup buttons*/}
                <div className="button-group">
                    <button
                        onClick = {() => handleSubmit(login)}
                        disabled = {loading}
                    Sign In>
                    </button>

                    <button
                        onClick = {() => handleSubmit(signup)}
                        disabled = {loading}
                    Sign Up>
                    </button>
                </div>
        </div>
    </div>
  )
}

export default LoginAppPage
