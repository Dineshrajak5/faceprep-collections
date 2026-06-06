// Clears the session cookie and sends the user back to the login screen.
module.exports = (req, res) => {
  res.setHeader('Set-Cookie',
    'fp_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0');
  res.statusCode = 302;
  res.setHeader('Location', '/login');
  res.end();
};
