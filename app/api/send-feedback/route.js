import { NextResponse } from 'next/server'
import nodemailer from 'nodemailer'
import prisma from '@/lib/prisma'

// Force dynamic - prevent static generation
export const dynamic = 'force-dynamic'

// Email configuration - recipient is hidden in environment variable
const RECIPIENT_EMAIL = process.env.FEEDBACK_EMAIL || 'support@alphalabs.io'

export async function POST(request) {
  try {
    const body = await request.json()
    const { name, email, subject, message } = body

    // Validate required fields
    if (!name || !email || !message) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { success: false, error: 'Invalid email format' },
        { status: 400 }
      )
    }

    // Save feedback to database
    let savedFeedback = null
    if (prisma) {
      try {
        savedFeedback = await prisma.feedback.create({
          data: {
            name,
            email,
            subject: subject || 'general',
            message,
            status: 'unread',
            priority: subject === 'bug' ? 'high' : 'normal'
          }
        })
        console.log('Feedback saved to database:', savedFeedback.id)
      } catch (dbError) {
        console.error('Failed to save feedback to database:', dbError)
        // Continue even if database save fails
      }
    }

    // Subject mapping
    const subjectMap = {
      general: 'General Inquiry',
      bug: 'Bug Report',
      feature: 'Feature Request',
      feedback: 'Feedback',
      other: 'Other'
    }

    const emailSubject = `[Alphalabs] ${subjectMap[subject] || 'Message'} from ${name}`

    // Create email content
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #4488ff 0%, #9d4edd 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; }
            .content { background: #f9f9f9; padding: 20px; border: 1px solid #ddd; border-top: none; border-radius: 0 0 8px 8px; }
            .field { margin-bottom: 15px; }
            .label { font-weight: bold; color: #555; }
            .value { margin-top: 5px; }
            .message-box { background: white; padding: 15px; border-radius: 8px; border: 1px solid #eee; margin-top: 10px; }
            .footer { text-align: center; margin-top: 20px; color: #888; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h2 style="margin: 0;">New Feedback from Alphalabs</h2>
            </div>
            <div class="content">
              <div class="field">
                <div class="label">From:</div>
                <div class="value">${name} (${email})</div>
              </div>
              <div class="field">
                <div class="label">Subject Type:</div>
                <div class="value">${subjectMap[subject] || 'General'}</div>
              </div>
              <div class="field">
                <div class="label">Message:</div>
                <div class="message-box">${message.replace(/\n/g, '<br>')}</div>
              </div>
            </div>
            <div class="footer">
              <p>This email was sent from the Alphalabs Help page.</p>
              <p>Reply directly to this email to respond to ${name}.</p>
            </div>
          </div>
        </body>
      </html>
    `

    const textContent = `
New Feedback from Alphalabs
===========================

From: ${name} (${email})
Subject Type: ${subjectMap[subject] || 'General'}

Message:
${message}

---
This email was sent from the Alphalabs Help page.
Reply directly to this email to respond to ${name}.
    `

    // Check if email credentials are configured
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
      // If no SMTP configured, log the message and return success
      console.log('=== FEEDBACK RECEIVED (SMTP not configured) ===')
      console.log('From:', name, email)
      console.log('Subject:', subjectMap[subject])
      console.log('Message:', message)
      console.log('Would send to:', RECIPIENT_EMAIL)
      console.log('===============================================')
      
      return NextResponse.json({
        success: true,
        message: 'Feedback received (email service not configured)',
        debug: true
      })
    }

    // Create transporter
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    })

    // Send email
    await transporter.sendMail({
      from: `"Alphalabs Feedback" <${process.env.SMTP_USER}>`,
      replyTo: email,
      to: RECIPIENT_EMAIL,
      subject: emailSubject,
      text: textContent,
      html: htmlContent,
    })

    console.log('Feedback email sent successfully to:', RECIPIENT_EMAIL)

    return NextResponse.json({
      success: true,
      message: 'Feedback sent successfully'
    })

  } catch (error) {
    console.error('Error sending feedback:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to send feedback' },
      { status: 500 }
    )
  }
}

