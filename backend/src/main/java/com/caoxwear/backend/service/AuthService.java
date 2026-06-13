package com.caoxwear.backend.service;

import com.caoxwear.backend.dto.AuthRequest;
import com.caoxwear.backend.dto.AuthResponse;
import com.caoxwear.backend.dto.RegisterRequest;
import com.caoxwear.backend.entity.Role;
import com.caoxwear.backend.entity.User;
import com.caoxwear.backend.repository.UserRepository;
import com.caoxwear.backend.security.JwtService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class AuthService {
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final AuthenticationManager authenticationManager;
    private final JwtService jwtService;

    public AuthResponse register(RegisterRequest request) {
        if (userRepository.existsByEmail(request.email())) {
            throw new IllegalArgumentException("El correo ya esta registrado");
        }
        User user = new User();
        user.setNombres(request.nombres());
        user.setApellidos(request.apellidos());
        user.setEmail(request.email());
        user.setPassword(passwordEncoder.encode(request.password()));
        user.setRol(request.rol() == null ? Role.CLIENTE : request.rol());
        userRepository.save(user);
        return response(user);
    }

    public AuthResponse login(AuthRequest request) {
        authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(request.email(), request.password()));
        User user = userRepository.findByEmail(request.email()).orElseThrow();
        return response(user);
    }

    private AuthResponse response(User user) {
        return new AuthResponse(jwtService.generate(user), user.getId(), user.getNombres(), user.getEmail(), user.getRol());
    }
}
