

const roomId = "<%= room._id %>";
const socket = new WebSocket("ws://localhost:8000");

socket.onopen = () => {
    console.log("Connected to the chatroom:", roomId);
};

socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    const messageList = document.getElementById("message-list");
    const messageElem = document.createElement("div");
    messageElem.textContent = `${message.username}: ${message.text}`;
    messageList.appendChild(messageElem);
};

document.getElementById("send-message").addEventListener("click", () => {
    const input = document.getElementById("message-input");
    const text = input.value;
    if (text) {
        socket.send(JSON.stringify({ roomId, text }));
        input.value = "";
    }
});        



document.addEventListener('DOMContentLoaded', () => {
    const submenuItems = document.querySelectorAll('.has-submenu');

    submenuItems.forEach(item => {
        item.addEventListener('mouseenter', () => {
            if (!document.body.classList.contains('touch-device')) {
                item.querySelector('.submenu').style.display = 'block';
            }
        });

        item.addEventListener('mouseleave', () => {
            if (!document.body.classList.contains('touch-device')) {
                item.querySelector('.submenu').style.display = 'none';
            }
        });

        item.addEventListener('click', (e) => {
            if (document.body.classList.contains('touch-device')) {
                const submenu = item.querySelector('.submenu');
                if (submenu) {
                    e.preventDefault();
                    toggleSubmenu(e, submenu);
                }
            }
        });
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.has-submenu')) {
            submenuItems.forEach(item => {
                const submenu = item.querySelector('.submenu');
                if (submenu) {
                    submenu.style.display = 'none';
                }
            });
        }
    });

    // Handle mobile menu toggle
    const menuIcon = document.querySelector('.menu-icon');
    if (menuIcon) {
        menuIcon.addEventListener('click', toggleMenu);
    }

    const overlay = document.getElementById('overlay');
    if (overlay) {
        overlay.addEventListener('click', closeMenu);
    }

    // Attach event listeners to submenu toggle links
    document.querySelectorAll('.toggle-link').forEach(toggleLink => {
        toggleLink.addEventListener('click', (e) => {
            e.preventDefault();
            toggleSubmenu(e, toggleLink);
        });
    });

    // Footer Visibility
    const footer = document.querySelector('footer');
    function checkFooterVisibility() {
        const scrollY = window.scrollY;
        const windowHeight = window.innerHeight;
        const bodyHeight = document.body.offsetHeight;

        if (bodyHeight <= windowHeight) {
            document.body.style.minHeight = `${windowHeight + footer.offsetHeight}px`;
        }

        if (scrollY > 0) {
            footer.classList.add('visible');
        } else {
            footer.classList.remove('visible');
        }
    }

    window.addEventListener('scroll', checkFooterVisibility);
    window.addEventListener('resize', checkFooterVisibility);
    checkFooterVisibility();

    // Smooth Scroll for Anchor Links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            document.querySelector(this.getAttribute('href')).scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        });
    });

    // Contact form submission
    document.getElementById('contact-form').addEventListener('submit', function (e) {
        e.preventDefault();
        const formData = new FormData(this);
        const urlEncodedData = new URLSearchParams(formData).toString();
        fetch('/contact', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: urlEncodedData
        }).then(response => response.text())
          .then(data => {
              alert(data);
              if (data === 'Email sent successfully') {
                  document.getElementById('contact-form').reset();
              }
          })
          .catch(error => console.error('Error:', error));
    });

    // Notify form submission
    document.getElementById('notify-form').addEventListener('submit', function (e) {
        e.preventDefault();
        const formData = new FormData(this);
        const urlEncodedData = new URLSearchParams(formData).toString();
        fetch('/technical', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: urlEncodedData
        }).then(response => response.text())
          .then(data => {
              alert(data);
              if (data === 'You have been added to the notification list') {
                  document.getElementById('notify-form').reset();
              }
          })
          .catch(error => console.error('Error:', error));
    });
});

function toggleMenu() {
    const menu = document.getElementById('mobile-menu');
    const overlay = document.getElementById('overlay');

    if (menu.style.display === 'block') {
        menu.style.display = 'none';
        overlay.style.display = 'none';
        document.body.classList.remove('mobile-menu-open');
    } else {
        menu.style.display = 'block';
        overlay.style.display = 'block';
        document.body.classList.add('mobile-menu-open');
    }
}

function closeMenu() {
    document.getElementById('mobile-menu').style.display = 'none';
    document.getElementById('overlay').style.display = 'none';
    document.body.classList.remove('mobile-menu-open');
}

function toggleSubmenu(event, element) {
    event.preventDefault();
    const submenu = element.nextElementSibling;
    if (submenu.style.display === 'block') {
        submenu.style.display = 'none';
    } else {
        document.querySelectorAll('.mobile-submenu').forEach(s => s.style.display = 'none');
        submenu.style.display = 'block';
    }
}

document.addEventListener('DOMContentLoaded', function () {
    var buttons = document.querySelectorAll('.read-more-btn');
    buttons.forEach(function (button) {
        button.addEventListener('click', function () {
            var targetId = this.getAttribute('data-target');
            var p = document.getElementById(targetId);
            var card = p.closest('.project-card');
            if (p.classList.contains('show-more')) {
                p.classList.remove('show-more');
                card.classList.remove('expanded');
                this.textContent = '≥';
            } else {
                p.classList.add('show-more');
                card.classList.add('expanded');
                this.textContent = '<';
            }
        });
    });
});
